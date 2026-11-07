import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  encodeAbiParameters,
  formatEther,
  formatUnits,
  http,
  keccak256,
  parseEther,
  parseUnits,
  verifyTypedData,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { faucetAbi } from "./abi";
import { elysiumTestnet, hyperEvmTestnet, rpcUrl } from "./chain";
import { Logo } from "./Logo";
import { matchDeployments } from "./matchDeployments";
import "./match.css";
import { marketQuote, baseForBudget } from "./matchPricing";
import { sourceAbi, destAbi, positionAbi, factoryAbi } from "./matchAbi";
import { usePath } from "./router";
import { deskPath, matchPath, SiteFooter, TestnetNote } from "./site";

const BPS = 10_000n;
const EXIT_FEE_BPS = 20n;
const PROTOCOL_FEE_BPS = 5n;
const BONUS_OF_FEE_BPS = 2_000n;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const panels = [
  { href: matchPath, label: "Exit" },
  { href: `${matchPath}/deposit`, label: "Deposit" },
  { href: `${matchPath}/lp`, label: "LP" },
  { href: `${matchPath}/recovery`, label: "Recovery" },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const quoteTypes = { Quote: [{ name: "fillId", type: "bytes32" }] } as const;

type FundInput = {
  depositor: Address;
  recipient: Address;
  usdc: bigint;
  whype: bigint;
  secretHash: Hex;
  claimBefore: bigint;
  refundAfter: bigint;
  exitUser: Address;
  gasElysium: bigint;
  gasHyper: bigint;
  quotedAt: bigint;
  direction: number;
  nonce: bigint;
  expectedBonus: bigint;
};

function panelFrom(path: string) {
  if (path.startsWith(`${matchPath}/deposit`)) return "deposit";
  if (path.startsWith(`${matchPath}/lp`)) return "lp";
  if (path.startsWith(`${matchPath}/recovery`)) return "recovery";
  return "exit";
}

export function quoteMatch(
  whype: bigint,
  gasElysium: bigint,
  gasHyper: bigint,
) {
  const fee = (whype * PROTOCOL_FEE_BPS) / BPS;
  const bonus = (fee * BONUS_OF_FEE_BPS) / BPS;
  const payment = (whype * (BPS - EXIT_FEE_BPS)) / BPS;
  return {
    fee,
    bonus,
    shift: fee - bonus,
    payment,
    lock: payment + gasHyper,
    depositorOut: whype - fee - gasElysium,
  };
}

function freshSecret(): { secret: Hex; secretHash: Hex } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret =
    `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}` as Hex;
  const secretHash = keccak256(
    encodeAbiParameters([{ type: "bytes32" }], [secret]),
  );
  return { secret, secretHash };
}

const whypeAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

type StoredQuote = {
  signature?: string;
  version?: number;
  position?: string;
  fillId?: string;
  input?: Record<string, string>;
};

function isAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function readStored(): StoredQuote | null {
  const saved = localStorage.getItem("shift-match-quote");
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as StoredQuote;
    return parsed.version === 2 && parsed.input ? parsed : null;
  } catch {
    return null;
  }
}

const elysium = createPublicClient({
  chain: elysiumTestnet,
  transport: http(rpcUrl, { batch: { wait: 30, batchSize: 20 } }),
});
const hyper = createPublicClient({
  chain: hyperEvmTestnet,
  transport: http(hyperEvmTestnet.rpcUrls.default.http[0], { batch: { wait: 30, batchSize: 20 } }),
});

export function Match() {
  const path = usePath();
  const panel = panelFrom(path);
  const deployed =
    matchDeployments.sourceMatch !== ZERO && matchDeployments.factory !== ZERO;
  const [whypeText, setWhypeText] = useState("0.05");
  const [usdcText, setUsdcText] = useState("4");
  const [gasEText, setGasEText] = useState("0");
  const [gasHText, setGasHText] = useState("0");
  const [depositor, setDepositor] = useState("");

  const [quoteSig, setQuoteSig] = useState("");
  const [fillId, setFillId] = useState("");
  const [secret, setSecret] = useState("");
  const [quoteCard, setQuoteCard] = useState("");
  const [position, setPosition] = useState<Address>(matchDeployments.position);

  const [inventory, setInventory] = useState({
    reserved: 0n,
    usdc: 0n,
    bonus: 0n,
  });
  const [historyCards,setHistoryCards]=useState<StoredQuote[]>(()=>{try{return JSON.parse(localStorage.getItem("shift-match-history")||"[]");}catch{return [];}});
  const [now,setNow]=useState(Math.floor(Date.now()/1000));
  const [busy,setBusy]=useState(false);
  const [manualQuote,setManualQuote]=useState(false);
  const [connectedAddress,setConnectedAddress]=useState<Address|null>(null);
  const [progress,setProgress]=useState({source:0,dest:0,credit:0n});
  const [marketStatus, setMarketStatus] = useState("");
  const [limitText, setLimitText] = useState("0.05");
  const [available, setAvailable] = useState<bigint | null>(null);
  const [status, setStatus] = useState(
    deployed
      ? "Connect a wallet on Elysium testnet."
      : "Elysium Match is not deployed.",
  );

  const quote = useMemo(() => {
    try {
      const whype = parseEther(whypeText || "0");
      const gasE = parseEther(gasEText || "0");
      const gasH = parseEther(gasHText || "0");
      if (
        whype < parseEther("0.001") ||
        gasE + (whype * PROTOCOL_FEE_BPS) / BPS >= whype
      )
        return null;
      const result = quoteMatch(whype, gasE, gasH);
      if (quoteCard) {
        const card = JSON.parse(quoteCard) as StoredQuote;
        if (
          card.input?.whype === String(whype) &&
          card.input.expectedBonus !== undefined
        ) {
          result.bonus = BigInt(card.input.expectedBonus);
          result.shift = result.fee - result.bonus;
        }
      }
      return result;
    } catch {
      return null;
    }
  }, [whypeText, gasEText, gasHText, quoteCard]);

  useEffect(() => {
    const savedPosition = localStorage.getItem("shift-match-position");
    const parsed = readStored();
    const nextPosition = parsed?.position || savedPosition;
    if (nextPosition && isAddress(nextPosition)) setPosition(nextPosition);
    if (!parsed) return;
    setQuoteCard(JSON.stringify(parsed, null, 2));
    if (parsed.signature) setQuoteSig(parsed.signature);
    if (parsed.fillId)
      setSecret(sessionStorage.getItem("shift-secret:" + parsed.fillId) || "");
    if (parsed.input?.whype)
      setWhypeText(formatEther(BigInt(parsed.input.whype)));
    if (parsed.input?.usdc)
      setUsdcText(formatUnits(BigInt(parsed.input.usdc), 6));
    if (parsed.input?.gasElysium)
      setGasEText(formatEther(BigInt(parsed.input.gasElysium)));
    if (parsed.input?.gasHyper)
      setGasHText(formatEther(BigInt(parsed.input.gasHyper)));
    if (parsed.fillId) setFillId(parsed.fillId);
    if (parsed.input?.depositor) setDepositor(parsed.input.depositor);

  }, []);

  useEffect(() => {
    if (!deployed || !isAddress(position)) return;
    void elysium
      .readContract({
        address: position,
        abi: positionAbi,
        functionName: "available",
      })
      .then(setAvailable)
      .catch(() => setAvailable(null));
  }, [deployed, position, status]);

  useEffect(() => {
    if (!deployed || !isAddress(position) || !path.endsWith("/lp")) return;
    let alive = true;
    const refresh = async () => {
      try {
        const [reserved, usdc, owner] = await Promise.all([
          elysium.readContract({
            address: position,
            abi: positionAbi,
            functionName: "reserved",
          }),
          elysium.readContract({
            address: position,
            abi: positionAbi,
            functionName: "usdcEarned",
          }),
          elysium.readContract({
            address: position,
            abi: positionAbi,
            functionName: "owner",
          }),
        ]);
        const bonus = await elysium.readContract({
          address: matchDeployments.sourceMatch,
          abi: sourceAbi,
          functionName: "nativeCredit",
          args: [owner],
        });
        if (alive) setInventory({ reserved, usdc, bonus });
      } catch {
        /* inventory stays unread until the position is reachable */
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [deployed, position, status, path]);

  useEffect(()=>{
    const encoded=new URLSearchParams(location.hash.slice(1)).get("quote");
    if(encoded){
      try{rememberQuote(decodeURIComponent(escape(atob(encoded))));}
      catch{setStatus("The request link could not be read. Import a public quote from the other participant.");}
      history.replaceState(null,"",location.pathname);
    }
  },[path]);

  useEffect(()=>{
    if(!/^0x[0-9a-fA-F]{64}$/.test(fillId))return;
    let active=true;
    const refresh=async()=>{
      try{
        const [source,lock]=await Promise.all([
          elysium.readContract({address:matchDeployments.sourceMatch,abi:sourceAbi,functionName:"getFill",args:[fillId as Hex]}),
          hyper.readContract({address:matchDeployments.destMatch,abi:destAbi,functionName:"locks",args:[fillId as Hex]})
        ]);
        const credit=await hyper.readContract({address:matchDeployments.destMatch,abi:destAbi,functionName:"credit",args:[lock[1]]});
        if(active)setProgress({source:source.status,dest:lock[6],credit});
      }catch{ /* allow retry while either testnet RPC is temporarily unavailable */ }
    };
    void refresh();const timer=setInterval(()=>void refresh(),5000);
    return()=>{active=false;clearInterval(timer);};
  },[fillId,status]);

  useEffect(()=>{const timer=setInterval(()=>setNow(Math.floor(Date.now()/1000)),1000);return()=>clearInterval(timer);},[]);

  async function shareQuote(role:"lp"|"exit"|"deposit"){
    const card=readStored();
    if(!card)throw new Error("Prepare or import a request first.");
    const publicCard={version:2,position:card.position,fillId:card.fillId,input:card.input,signature:card.signature};
    const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(publicCard))));
    const route=role==="exit"?matchPath:matchPath+"/"+role;
    await navigator.clipboard.writeText(location.origin+route+"#quote="+encoded);
    setStatus("Public request link copied. The recovery secret stays private.");
  }

  async function receiveHype(){
    await hyperMove("claim");
    await hyperMove("take");
  }

  async function connect(chain: Chain) {
    if (!window.ethereum) {
      setStatus("No wallet found in this browser.");
      return null;
    }
    const chainId = `0x${chain.id.toString(16)}`;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls.default.http,
          blockExplorerUrls: [chain.blockExplorers?.default.url].filter(
            Boolean,
          ),
        },
      ],
    });
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];
    const next = accounts[0] as Address;
    const client = createWalletClient({
      account: next,
      chain,
      transport: custom(window.ethereum),
    });

    setConnectedAddress(next);
    setStatus(`Connected ${next}.`);
    return client;
  }

  function buildInput(exit: Address, nonceValue: bigint): FundInput | null {
    if (!quote) return null;
    try {
      const whype = parseEther(whypeText);
      const usdc = parseUnits(usdcText || "0", 6);
      const now = BigInt(Math.floor(Date.now() / 1000));
      const claimBefore = now + 20n * 60n;
      return {
        depositor: depositor as Address,
        recipient: exit,
        usdc,
        whype,
        secretHash:
          secret.startsWith("0x") && secret.length === 66
            ? keccak256(
                encodeAbiParameters([{ type: "bytes32" }], [secret as Hex]),
              )
            : freshSecret().secretHash,
        claimBefore,
        refundAfter: claimBefore + 2n * 60n * 60n,
        exitUser: exit,
        gasElysium: parseEther(gasEText || "0"),
        gasHyper: parseEther(gasHText || "0"),
        quotedAt: now,
        direction: 1,
        nonce: nonceValue,
        expectedBonus: 0n,
      };
    } catch {
      return null;
    }
  }

  async function useMarketQuote() {
    const response = await fetch("/hl/info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "l2Book", coin: "@107" }),
    });
    if (!response.ok) throw new Error("Market data unavailable.");
    const book = await response.json();
    const usdc = marketQuote(book.levels[1], parseEther(whypeText), book.time);
    setUsdcText(formatUnits(usdc, 6));
    setMarketStatus(
      "Size-aware HyperCore ask reference + 10 bps LP spread. The LP must approve this testnet quote.",
    );
  }

  async function prepareRequest() {
    const client = await connect(elysiumTestnet);
    const account = client?.account?.address;
    if (!account || !isAddress(position)) return;
    const nonce = await elysium.readContract({
      address: position,
      abi: positionAbi,
      functionName: "quoteNonce",
    });
    const made = freshSecret();
    const input = buildInput(account, nonce);
    if (!input || !isAddress(input.depositor))
      throw new Error("Enter the depositor address.");
    if(!manualQuote){
      const response=await fetch("/hl/info",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"l2Book",coin:"@107"})});
      if(!response.ok)throw new Error("Market reference is unavailable. Try again shortly.");
      const book=await response.json();
      input.whype=baseForBudget(book.levels[1],input.usdc,book.time);
      setWhypeText(formatEther(input.whype));
    }
    const capacity=await elysium.readContract({address:position,abi:positionAbi,functionName:"available"});
    if(input.whype>capacity)throw new Error("This LP has insufficient available HYPE. Choose another position or a smaller amount.");
    input.secretHash = made.secretHash;
    input.expectedBonus = await elysium.readContract({
      address: matchDeployments.sourceMatch,
      abi: sourceAbi,
      functionName: "previewBonus",
      args: [input.whype],
    });
    const id = await elysium.readContract({
      address: matchDeployments.sourceMatch,
      abi: sourceAbi,
      functionName: "hashFill",
      args: [position, account, input],
    });
    sessionStorage.setItem("shift-secret:" + id, made.secret);
    setSecret(made.secret);
    const card: StoredQuote = {
      version: 2,
      position,
      fillId: id,
      input: Object.fromEntries(
        Object.entries(input).map(([k, v]) => [k, String(v)]),
      ),
    };
    rememberQuote(JSON.stringify(card, null, 2));
    setStatus(
      "Request ready. Save your private recovery secret, then share only the public request with the LP.",
    );
  }

  async function signQuote() {
    const client = await connect(elysiumTestnet);
    const account = client?.account?.address;
    const card = readStored();
    if (!client || !account || !card?.input || !card.position || !card.fillId)
      throw new Error("Paste an exit user's public request first.");
    const signer = await elysium.readContract({
      address: card.position as Address,
      abi: positionAbi,
      functionName: "signer",
    });
    if (signer.toLowerCase() !== account.toLowerCase())
      throw new Error("Connect this position's quote signer.");
    const input = storedInput(card);
    const id = await elysium.readContract({
      address: matchDeployments.sourceMatch,
      abi: sourceAbi,
      functionName: "hashFill",
      args: [card.position as Address, input.exitUser, input],
    });
    if (id !== card.fillId)
      throw new Error(
        "Request ID does not match its terms or this deployment.",
      );
    card.signature = await client.signTypedData({
      account,
      domain: {
        name: "Shift Match",
        version: "2",
        chainId: elysiumTestnet.id,
        verifyingContract: matchDeployments.sourceMatch,
      },
      types: quoteTypes,
      primaryType: "Quote",
      message: { fillId: id },
    });
    rememberQuote(JSON.stringify(card, null, 2));
    setStatus(
      "All fill terms signed. Share this public card with the exit user and depositor.",
    );
  }

  async function fund() {
    const client = await connect(elysiumTestnet);
    const account = client?.account?.address;
    if (!client || !account || !deployed || !quote) return;
    const saved = localStorage.getItem("shift-match-quote");
    const parsed = saved ? (JSON.parse(saved) as StoredQuote) : {};
    const signature = (quoteSig || parsed.signature || "") as Hex;
    if (!signature.startsWith("0x") || !parsed.input) {
      setStatus(
        "The LP has to sign this quote first. The signature expires in 10 minutes.",
      );
      return;
    }
    const stored = parsed.input;
    let input: FundInput = {
      depositor: stored.depositor as Address,
      recipient: stored.recipient as Address,
      usdc: BigInt(stored.usdc),
      whype: BigInt(stored.whype),
      secretHash: stored.secretHash as Hex,
      claimBefore: BigInt(stored.claimBefore),
      refundAfter: BigInt(stored.refundAfter),
      exitUser: account,
      gasElysium: BigInt(stored.gasElysium),
      gasHyper: BigInt(stored.gasHyper),
      quotedAt: BigInt(stored.quotedAt),
      direction: Number(stored.direction),
      nonce: BigInt(stored.nonce),
      expectedBonus: BigInt(stored.expectedBonus),
    };
    if (stored.exitUser.toLowerCase() !== account.toLowerCase()) {
      setStatus("Connect the exit wallet that was signed into this quote.");
      return;
    }
    if (parsed.fillId)
      setSecret(sessionStorage.getItem("shift-secret:" + parsed.fillId) || "");
    const signedPosition = parsed.position && isAddress(parsed.position) ? parsed.position : position;
    const actualId=await elysium.readContract({address:matchDeployments.sourceMatch,abi:sourceAbi,functionName:"hashFill",args:[signedPosition,input.exitUser,input]});
    const signer=await elysium.readContract({address:signedPosition,abi:positionAbi,functionName:"signer"});
    if(actualId!==parsed.fillId || !await verifyTypedData({address:signer,
      domain:{name:"Shift Match",version:"2",chainId:elysiumTestnet.id,verifyingContract:matchDeployments.sourceMatch},
      types:quoteTypes,primaryType:"Quote",message:{fillId:actualId},signature}))
      throw new Error("This LP quote is invalid or belongs to a different deployment. Request a fresh quote.");
    const allowance = await elysium.readContract({
      address: matchDeployments.usdc,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, matchDeployments.sourceMatch],
    });
    if (allowance < input.usdc) {
      setStatus("Approving mUSDC…");
      const hash = await client.writeContract({
        address: matchDeployments.usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [matchDeployments.sourceMatch, input.usdc],
        account,
        chain: elysiumTestnet,
      });
      await confirmed(elysium, hash);
    }
    setStatus("Funding the exit…");
    const hash = await client.writeContract({
      address: matchDeployments.sourceMatch,
      abi: sourceAbi,
      functionName: "fund",
      args: [signedPosition, input, signature],
      account,
      chain: elysiumTestnet,
    });
    const receipt = await confirmed(elysium, hash);
    setStatus(
      `Funded in ${receipt.transactionHash}. Save the secret shown on this page.`,
    );
  }

  async function drip() {
    const client = await connect(elysiumTestnet);
    const account = client?.account?.address;
    if (!client || !account) return;
    setStatus("Requesting test mUSDC…");
    const hash = await client.writeContract({
      address: matchDeployments.faucet,
      abi: faucetAbi,
      functionName: "drip",
      args: [],
      account,
      chain: elysiumTestnet,
    });
    await confirmed(elysium, hash);
    setStatus("Faucet confirmed. It sends SDA and mUSDC, then waits one hour.");
  }

  async function lock() {
    const client = await connect(hyperEvmTestnet);
    const account = client?.account?.address;
    if (!client || !account || matchDeployments.destMatch === ZERO) return;
    const saved = localStorage.getItem("shift-match-quote");
    const parsed = saved ? (JSON.parse(saved) as StoredQuote) : {};
    const stored = parsed.input;
    if (!stored?.depositor) {
      setStatus(
        "The LP has to sign this quote first. Lock uses that signed fill.",
      );
      return;
    }
    if (stored.depositor.toLowerCase() !== account.toLowerCase()) {
      setStatus("Connect the depositor wallet named in the signed quote.");
      return;
    }
    const whype = BigInt(stored.whype);
    const gasHyper = BigInt(stored.gasHyper);
    const value = (whype * (BPS - EXIT_FEE_BPS)) / BPS + gasHyper;
    if (parsed.fillId)
      setSecret(sessionStorage.getItem("shift-secret:" + parsed.fillId) || "");
    const input = storedInput(parsed);
    const id = await elysium.readContract({
      address: matchDeployments.sourceMatch,
      abi: sourceAbi,
      functionName: "hashFill",
      args: [parsed.position as Address, input.exitUser, input],
    });
    const state = await elysium.readContract({
      address: matchDeployments.sourceMatch,
      abi: sourceAbi,
      functionName: "getFill",
      args: [id],
    });
    if (
      id !== parsed.fillId ||
      state.status !== 1 ||
      state.depositor.toLowerCase() !== account.toLowerCase()
    )
      throw new Error("The exact source fill must be funded before locking.");
    const current = await hyper.getBlock();
    if (input.claimBefore <= current.timestamp + 300n)
      throw new Error("Insufficient time left to claim safely.");
    setStatus("Locking HYPE on HyperEVM…");
    const hash = await client.writeContract({
      address: matchDeployments.destMatch,
      abi: destAbi,
      functionName: "lock",
      value,
      args: [
        {
          sourceChainId: BigInt(elysiumTestnet.id),
          source: matchDeployments.sourceMatch,
          position:
            parsed.position && isAddress(parsed.position)
              ? parsed.position
              : position,
          exitUser: stored.exitUser as Address,
          recipient: stored.recipient as Address,
          usdc: BigInt(stored.usdc),
          whype,
          secretHash: stored.secretHash as Hex,
          claimBefore: BigInt(stored.claimBefore),
          refundAfter: BigInt(stored.refundAfter),
          gasElysium: BigInt(stored.gasElysium),
          gasHyper,
          nonce: BigInt(stored.nonce),
          expectedBonus: BigInt(stored.expectedBonus),
          quotedAt: BigInt(stored.quotedAt),
          direction: Number(stored.direction),
        },
      ],
      account,
      chain: hyperEvmTestnet,
    });
    const receipt = await confirmed(hyper, hash);
    if (parsed.input?.whype)
      setWhypeText(formatEther(BigInt(parsed.input.whype)));
    if (parsed.input?.usdc)
      setUsdcText(formatUnits(BigInt(parsed.input.usdc), 6));
    if (parsed.input?.gasElysium)
      setGasEText(formatEther(BigInt(parsed.input.gasElysium)));
    if (parsed.input?.gasHyper)
      setGasHText(formatEther(BigInt(parsed.input.gasHyper)));
    if (parsed.fillId) setFillId(parsed.fillId);
    setStatus(
      `Locked on HyperEVM in ${receipt.transactionHash}. The exit wallet can claim with the secret.`,
    );
  }

  function rememberQuote(raw: string) {
    setQuoteCard(raw);
    const parsed = JSON.parse(raw) as StoredQuote;
    if (parsed.version !== 2 || !parsed.input || "secret" in parsed)
      throw new Error(
        "Use a version 2 public card without a secret. Legacy cards are unsafe.",
      );
    localStorage.setItem("shift-match-quote", JSON.stringify(parsed));
    let history:StoredQuote[]=[];
    try{const stored=JSON.parse(localStorage.getItem("shift-match-history")||"[]");if(Array.isArray(stored))history=stored;}catch{}
    const next=[parsed,...history.filter(item=>item.fillId!==parsed.fillId)].slice(0,25);
    localStorage.setItem("shift-match-history",JSON.stringify(next));
    setHistoryCards(next);

    if (parsed.signature) setQuoteSig(parsed.signature);
    if (parsed.fillId)
      setSecret(sessionStorage.getItem("shift-secret:" + parsed.fillId) || "");
    if (parsed.input?.whype)
      setWhypeText(formatEther(BigInt(parsed.input.whype)));
    if (parsed.input?.usdc)
      setUsdcText(formatUnits(BigInt(parsed.input.usdc), 6));
    if (parsed.input?.gasElysium)
      setGasEText(formatEther(BigInt(parsed.input.gasElysium)));
    if (parsed.input?.gasHyper)
      setGasHText(formatEther(BigInt(parsed.input.gasHyper)));
    if (parsed.fillId) setFillId(parsed.fillId);
    if (parsed.position && isAddress(parsed.position)) {
      setPosition(parsed.position);
      localStorage.setItem("shift-match-position", parsed.position);
    }
    if (parsed.input.depositor) setDepositor(parsed.input.depositor);
    setStatus(
      "Quote card loaded. Fund from the exit wallet, then lock from the depositor wallet.",
    );
  }

  function usePosition(next: string) {
    setPosition(next as Address);
    if (isAddress(next)) localStorage.setItem("shift-match-position", next);
  }

  async function setLpPolicy(action: "pause" | "resume" | "limits") {
    const client = await connect(elysiumTestnet);
    const account = client?.account?.address;
    if (!client || !account) return;
    const hash =
      action === "limits"
        ? await client.writeContract({
            address: position,
            abi: positionAbi,
            functionName: "setLimits",
            args: [parseEther(limitText), parseEther(limitText)],
            account,
            chain: elysiumTestnet,
          })
        : await client.writeContract({
            address: position,
            abi: positionAbi,
            functionName: "setPaused",
            args: [action === "pause"],
            account,
            chain: elysiumTestnet,
          });
    await confirmed(elysium, hash);
    setStatus("LP policy updated.");
  }

  async function collectSourceCredit() {
    const client = await connect(elysiumTestnet);
    const account = client?.account?.address;
    if (!client || !account) return;
    const hash = await client.writeContract({
      address: matchDeployments.sourceMatch,
      abi: sourceAbi,
      functionName: "deliver",
      args: [account],
      account,
      chain: elysiumTestnet,
    });
    await confirmed(elysium, hash);
    setStatus("Native HYPE credit delivered.");
  }

  async function withdrawUsdc() {
    const client = await connect(elysiumTestnet);
    const account = client?.account?.address;
    if (!client || !account) return;
    const earned = await elysium.readContract({
      address: position,
      abi: positionAbi,
      functionName: "usdcEarned",
    });
    const hash = await client.writeContract({
      address: position,
      abi: positionAbi,
      functionName: "withdraw",
      args: [0n, earned],
      account,
      chain: elysiumTestnet,
    });
    await confirmed(elysium, hash);
    setStatus("LP USDC withdrawn.");
  }

  async function createPosition() {
    const client = await connect(elysiumTestnet);
    const account = client?.account?.address;
    if (!client || !account) return;
    setStatus("Creating your LP position…");
    const hash = await client.writeContract({
      address: matchDeployments.factory,
      abi: factoryAbi,
      functionName: "create",
      account,
      chain: elysiumTestnet,
    });
    const receipt = await confirmed(elysium, hash);
    const created = receipt.logs
      .map((log) => {
        try {
          return decodeEventLog({
            abi: factoryAbi,
            data: log.data,
            topics: log.topics,
          });
        } catch {
          return null;
        }
      })
      .find((log) => log?.eventName === "Created");
    if (!created || created.eventName !== "Created") {
      setStatus(
        "The position transaction landed, but its address was not in the receipt.",
      );
      return;
    }
    usePosition(created.args.position);
    setStatus(
      `Position ${created.args.position} is yours. Wrap HYPE, then deposit it.`,
    );
  }

  async function wrapWhype() {
    const client = await connect(elysiumTestnet);
    const account = client?.account?.address;
    if (!client || !account) return;
    const amount = parseEther(whypeText || "0");
    setStatus("Wrapping HYPE into WHYPE…");
    const hash = await client.writeContract({
      address: matchDeployments.whype,
      abi: whypeAbi,
      functionName: "deposit",
      value: amount,
      account,
      chain: elysiumTestnet,
    });
    await confirmed(elysium, hash);
    setStatus("WHYPE is in this wallet. Deposit it into your position.");
  }

  async function hyperMove(kind: "claim" | "take" | "refund") {
    const client = await connect(hyperEvmTestnet);
    const account = client?.account?.address;
    if (!client || !account) return;
    if (kind !== "take" && !fillId.startsWith("0x")) {
      setStatus("Paste the quote card so the fill id is loaded.");
      return;
    }
    if (kind === "claim" && !secret.startsWith("0x")) {
      setStatus("Paste the secret from the quote card.");
      return;
    }
    if (kind === "claim") {
      const card = readStored();
      if (!card?.input || !card.position)
        throw new Error("Import the public quote.");
      const input = storedInput(card);
      const id = await elysium.readContract({
        address: matchDeployments.sourceMatch,
        abi: sourceAbi,
        functionName: "hashFill",
        args: [card.position as Address, input.exitUser, input],
      });
      const [src, lock, block] = await Promise.all([
        elysium.readContract({
          address: matchDeployments.sourceMatch,
          abi: sourceAbi,
          functionName: "getFill",
          args: [id],
        }),
        hyper.readContract({
          address: matchDeployments.destMatch,
          abi: destAbi,
          functionName: "locks",
          args: [id],
        }),
        hyper.getBlock(),
      ]);
      if (
        id !== fillId ||
        src.status !== 1 ||
        lock[6] !== 1 ||
        lock[0].toLowerCase() !== input.depositor.toLowerCase() ||
        lock[1].toLowerCase() !== input.recipient.toLowerCase() ||
        lock[2] !==
          quoteMatch(input.whype, input.gasElysium, input.gasHyper).payment ||
        lock[3] !== input.gasHyper ||
        lock[4] !== input.secretHash ||
        lock[5] !== input.claimBefore ||
        block.timestamp + 120n >= input.claimBefore
      )
        throw new Error(
          "Destination terms, source state, or safety deadline do not match. Secret remains private.",
        );
      if (
        keccak256(
          encodeAbiParameters([{ type: "bytes32" }], [secret as Hex]),
        ) !== input.secretHash
      )
        throw new Error("Recovery secret does not match this fill.");
      const started=Date.now();
      while(await hyper.getBlockNumber()<block.number+2n){
        if(Date.now()-started>45000)throw new Error("Waiting for destination confirmations. Try Receive again.");
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
      const [canonical, latestLock, latestBlock] = await Promise.all([
        hyper.getBlock({blockNumber:block.number}),
        hyper.readContract({address:matchDeployments.destMatch,abi:destAbi,functionName:"locks",args:[id]}),
        hyper.getBlock()
      ]);
      if(canonical.hash!==block.hash || latestLock[6]!==1 || latestBlock.timestamp+120n>=input.claimBefore)
        throw new Error("Destination state changed. Secret remains private.");

    }
    if(kind==="refund"){
      const row=await hyper.readContract({address:matchDeployments.destMatch,abi:destAbi,functionName:"locks",args:[fillId as Hex]});
      if((await hyper.getBlock()).timestamp<row[5])throw new Error("The HyperEVM refund deadline has not arrived.");
    }
    setStatus(
      kind === "claim"
        ? "Claiming on HyperEVM…"
        : kind === "take"
          ? "Taking credited HYPE…"
          : "Refunding the HyperEVM lock…",
    );
    const hash = await client.writeContract({
      address: matchDeployments.destMatch,
      abi: destAbi,
      functionName: kind,
      args:
        kind === "claim"
          ? [fillId as Hex, secret as Hex]
          : kind === "refund"
            ? [fillId as Hex]
            : [],
      account,
      chain: hyperEvmTestnet,
    });
    await confirmed(hyper, hash);
    if(kind==="refund"){
      const row=await hyper.readContract({address:matchDeployments.destMatch,abi:destAbi,functionName:"locks",args:[fillId as Hex]});
      if((await hyper.getBlock()).timestamp<row[5])throw new Error("The HyperEVM refund deadline has not arrived.");
    }
    setStatus(
      kind === "claim"
        ? "Claim credited the HYPE. Take credited HYPE to receive it."
        : kind === "take"
          ? "Credited HYPE was sent to this wallet."
          : "HyperEVM lock credited the depositor. Take credited HYPE to receive it.",
    );
  }

  async function settleOrRefund(kind: "settle" | "refund") {
    const client = await connect(elysiumTestnet);
    const account = client?.account?.address;
    if (!client || !account || !deployed) return;
    if (!fillId.startsWith("0x")) {
      setStatus("Paste the fill id.");
      return;
    }
    if(kind==="refund"){
      const row=await elysium.readContract({address:matchDeployments.sourceMatch,abi:sourceAbi,functionName:"getFill",args:[fillId as Hex]});
      if((await elysium.getBlock()).timestamp<row.refundAfter)throw new Error("The Elysium refund deadline has not arrived.");
    }
    setStatus(kind === "settle" ? "Settling…" : "Refunding…");
    const hash = await client.writeContract({
      address: matchDeployments.sourceMatch,
      abi: sourceAbi,
      functionName: kind,
      args:
        kind === "settle" ? [fillId as Hex, secret as Hex] : [fillId as Hex],
      account,
      chain: elysiumTestnet,
    });
    await confirmed(elysium, hash);
    if (kind === "settle") {
      const card = readStored();
      if (card?.input?.depositor) {
        const deliver = await client.writeContract({
          address: matchDeployments.sourceMatch,
          abi: sourceAbi,
          functionName: "deliver",
          args: [card.input.depositor as Address],
          account,
          chain: elysiumTestnet,
        });
        await confirmed(elysium, deliver);
      }
    }
    setStatus(`${kind} confirmed.`);
  }

  async function run(action: () => Promise<void>) {
    if(busy)return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message.split("\n")[0] : "The transaction failed.",
      );
    } finally { setBusy(false); }
  }

  return (
    <div className="match-page">
      <header className="match-bar">
        <a className="brand" href="/" aria-label="Shift home">
          <Logo />
        </a>
        <nav className="match-nav" aria-label="Match">
          {panels.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={panelFrom(item.href) === panel ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
          <a href={deskPath}>Desk</a>
        </nav>
      </header>
      <main>
        <TestnetNote text="Elysium + HyperEVM testnets. Trades use test mUSDC and HYPE." />
        <section className="match-workspace">
          <div className="match-heading">
            <p className="match-kicker">{panel==="lp"?"Community liquidity":panel==="recovery"?"Your trade, on both chains":"Cross-chain Match"}</p>
            <h1>{panel==="exit"?"Exit to HyperEVM":panel==="deposit"?"Enter Elysium":panel==="lp"?"Provide liquidity":"Recover or finish a trade"}</h1>
            <p>{panel==="exit"?"Pay mUSDC on Elysium. Receive HYPE on HyperEVM.":panel==="deposit"?"Send HYPE on HyperEVM and receive HYPE on Elysium from a matched exit.":panel==="lp"?"Supply WHYPE from your own position. Settled fills pay you USDC and the quoted LP bonus.":"Import your public request to check what is funded, claimed or ready to refund."}</p>
          </div>
          <div className="match-layout">
            <div className="match-main-card" aria-busy={busy}><fieldset disabled={busy}>
              <div className="match-step-track" aria-label="Trade progress">
                <span data-active={progress.source===0}>Review quote</span><span data-active={progress.source===1&&progress.dest!==2}>Commit funds</span><span data-active={progress.dest===2||progress.source===2}>Receive</span>
              </div>
              {panel==="exit"?<label className="match-amount-label">You pay on Elysium
                <div className="match-amount-input"><input aria-label="mUSDC" disabled={!!quoteSig} value={usdcText} onChange={event=>setUsdcText(event.target.value)} inputMode="decimal"/><span>mUSDC</span></div>
              </label>:null}
              {quote?<div className="match-receive-box"><span>{panel==="deposit"?"You receive on Elysium":panel==="lp"?"LP quote supplies":"Quoted receive on HyperEVM"}</span>
                <strong>{(fillId?formatEther(panel==="deposit"?quote.depositorOut:panel==="lp"?parseEther(whypeText):quote.payment):"—")} <small>{panel==="lp"?"WHYPE":"HYPE"}</small></strong>
                <p>{panel==="deposit"?"Your HyperEVM lock: "+formatEther(quote.lock)+" HYPE":"Prepare a request to calculate amounts, then ask the LP to approve the quote."}</p>
              </div>:<p>Enter an amount with enough room for fees and gas.</p>}

              {fillId?<dl className="match-agreed-terms">
                <div><dt>Exit pays</dt><dd>{usdcText} mUSDC on Elysium</dd></div>
                <div><dt>LP supplies</dt><dd>{whypeText} WHYPE</dd></div>
                <div><dt>HyperEVM claim deadline</dt><dd>{readStored()?.input?.claimBefore?new Date(Number(readStored()!.input!.claimBefore)*1000).toLocaleString():"—"}</dd></div>
                <div><dt>Elysium refund opens</dt><dd>{readStored()?.input?.refundAfter?new Date(Number(readStored()!.input!.refundAfter)*1000).toLocaleString():"—"}</dd></div>
              </dl>:null}
              {panel==="exit"?<>
                <label>Incoming participant's wallet
                  <input value={depositor} onChange={event=>setDepositor(event.target.value)} placeholder="0x…" disabled={!!quoteSig}/>
                  <span className="field-help">Testnet trial: enter the wallet bringing HYPE into Elysium.</span>
                </label>
                {progress.source===0&&!quoteSig?<div className="match-primary-action"><button className="btn primary" type="button" onClick={()=>void run(prepareRequest)}>Request a quote</button><p>Your USDC stays in your wallet while the LP reviews the request.</p></div>:null}
                {fillId&&!quoteSig?<div className="match-next"><strong>Next, ask the LP to review.</strong><p>Share your public request link. Save your private recovery file before committing funds.</p><button className="btn" type="button" onClick={()=>void run(()=>shareQuote("lp"))}>Copy link for the LP</button></div>:null}
                {quoteSig&&progress.source===0?<div className="match-primary-action"><button className="btn primary" type="button" onClick={()=>void run(fund)}>Reserve USDC for this trade</button><p>This locks your USDC and the LP's WHYPE together on Elysium until settlement or the refund deadline.</p></div>:null}
                {progress.source===1&&progress.dest===0?<div className="match-next"><strong>Waiting for the incoming participant.</strong><p>Your USDC is reserved on Elysium. Share this request so they can lock their HyperEVM HYPE.</p><button className="btn" type="button" onClick={()=>void run(()=>shareQuote("deposit"))}>Copy link for depositor</button></div>:null}
                {progress.dest===1&&progress.source===1?<div className="match-primary-action"><button className="btn primary" type="button" onClick={()=>void run(receiveHype)}>Receive my HYPE</button><p>Two wallet confirmations claim and withdraw the credited HYPE on HyperEVM. Match checks both sides before revealing your secret.</p></div>:null}
                {progress.dest===2?<div className="match-next success"><strong>{progress.credit>0n?"Your HYPE is ready to withdraw.":"HyperEVM payment claimed."}</strong><p>{progress.credit>0n?"Withdraw the HYPE credited to your recipient wallet.":"Check your recipient wallet for the completed withdrawal."}</p>{progress.credit>0n?<button className="btn primary" type="button" onClick={()=>void run(()=>hyperMove("take"))}>Withdraw my HYPE</button>:null}<a href={matchPath+"/recovery"}>View settlement and recovery →</a></div>:null}
                <button className="btn quiet" type="button" onClick={()=>void run(drip)}>Get test mUSDC</button>
              </>:null}

              {panel==="deposit"?<>
                {!fillId?<div className="match-next"><strong>Open an exit user's request link.</strong><p>It loads the exact amount, recipient, fee and deadlines for your match.</p></div>:null}
                {fillId&&progress.source!==1&&progress.source!==2?<p className="match-explain">The exit user must reserve their USDC and the LP inventory before you send HYPE.</p>:null}
                <button className="btn primary" type="button" disabled={progress.source!==1||progress.dest!==0} onClick={()=>void run(lock)}>Lock {quote?formatEther(quote.lock):""} HYPE on HyperEVM</button>
                <p className="match-explain">Your payment stays in the HyperEVM contract until the exit user claims it. If its claim deadline passes, you can refund the lock.</p>
                {progress.dest===1?<div className="match-next"><strong>Your HYPE is locked.</strong><p>The exit user can now claim their payment. The Elysium leg then credits your HYPE.</p></div>:null}
                {progress.source===2?<button className="btn primary" type="button" onClick={()=>void run(collectSourceCredit)}>Collect my Elysium HYPE</button>:null}
              </>:null}

              {panel==="lp"?<>
                <div className="match-lp-balances"><div><span>Available WHYPE</span><strong>{available===null?"—":formatEther(available)}</strong></div><div><span>Reserved WHYPE</span><strong>{formatEther(inventory.reserved)}</strong></div><div><span>USDC proceeds</span><strong>{formatUnits(inventory.usdc,6)}</strong></div></div>
                {fillId&&!quoteSig?<><p className="match-explain">Review the imported amount and deadlines. Signing authorizes this exact fill to reserve your inventory.</p><button className="btn primary" type="button" onClick={()=>void run(signQuote)}>Approve this quote</button></>:null}
                {quoteSig?<button className="btn primary" type="button" onClick={()=>void run(()=>shareQuote("exit"))}>Copy signed link for exit user</button>:null}
                <details className="match-detail" open><summary>Manage my position</summary>
                  <label>Position address<input value={position} onChange={event=>usePosition(event.target.value)}/></label>
                  <label>WHYPE amount<input aria-label="LP WHYPE amount" value={whypeText} onChange={event=>setWhypeText(event.target.value)} inputMode="decimal"/></label>
                  <div className="match-actions"><button className="btn" type="button" onClick={()=>void run(createPosition)}>Create my position</button><button className="btn" type="button" onClick={()=>void run(wrapWhype)}>Wrap HYPE</button><button className="btn" type="button" onClick={()=>void run(()=>withdrawOrDeposit("deposit"))}>Add WHYPE</button><button className="btn" type="button" onClick={()=>void run(()=>withdrawOrDeposit("withdraw"))}>Withdraw available WHYPE</button><button className="btn" type="button" onClick={()=>void run(withdrawUsdc)}>Withdraw USDC proceeds</button><button className="btn" type="button" onClick={()=>void run(collectSourceCredit)}>Collect native rewards</button></div>
                  <label>Reservation limit in WHYPE<input value={limitText} onChange={event=>setLimitText(event.target.value)}/></label>
                  <div className="match-actions"><button className="btn" type="button" onClick={()=>void run(()=>setLpPolicy("limits"))}>Set limit</button><button className="btn" type="button" onClick={()=>void run(()=>setLpPolicy("pause"))}>Pause new fills</button><button className="btn" type="button" onClick={()=>void run(()=>setLpPolicy("resume"))}>Resume fills</button></div>
                </details>
              </>:null}

              {panel==="recovery"?<>
                {historyCards.length?<label>Recent requests<select value={fillId} onChange={event=>{const card=historyCards.find(item=>item.fillId===event.target.value);if(card)rememberQuote(JSON.stringify(card));}}><option value="">Choose a request</option>{historyCards.map(card=><option key={card.fillId} value={card.fillId}>{card.input?.usdc?formatUnits(BigInt(card.input.usdc),6):"—"} mUSDC · {card.fillId?.slice(0,12)}…</option>)}</select></label>:null}
                <div className="match-state-list"><div><span>Elysium</span><strong>{["Awaiting funding","USDC + WHYPE reserved","Settled","Original assets refunded"][progress.source]}</strong></div><div><span>HyperEVM</span><strong>{["Awaiting deposit","HYPE locked","Payment claimed","Depositor refunded"][progress.dest]}</strong></div></div>
                <p className="match-explain">Refunds return assets after their signed deadlines. A claimed HyperEVM payment requires the Elysium leg to settle within its time window.</p>
                <div className="match-actions"><button className="btn" type="button" disabled={progress.source!==1} onClick={()=>void run(()=>settleOrRefund("settle"))}>Finish Elysium settlement</button><button className="btn" type="button" disabled={progress.source!==1||now<Number(readStored()?.input?.refundAfter??Infinity)} onClick={()=>void run(()=>settleOrRefund("refund"))}>Refund Elysium assets</button><button className="btn" type="button" disabled={progress.dest!==1||now<Number(readStored()?.input?.claimBefore??Infinity)} onClick={()=>void run(()=>hyperMove("refund"))}>Refund HyperEVM lock</button><button className="btn" type="button" onClick={()=>void run(()=>hyperMove("take"))}>Withdraw HyperEVM credit</button><button className="btn" type="button" onClick={()=>void run(collectSourceCredit)}>Collect Elysium HYPE</button></div>
              </>:null}
              <p className="match-status" role="status" aria-live="polite">{status}</p>
              <details className="match-detail" open={!fillId&&panel!=="exit"}><summary>Share or import a public request</summary>
                <p>Public links and quote cards contain trade terms and signatures. Keep the recovery secret private.</p>
                <label>Quote card<textarea value={quoteCard} onChange={event=>{setQuoteCard(event.target.value);try{rememberQuote(event.target.value);}catch{setStatus("Paste the complete public quote card.");}}} spellCheck={false}/></label>
              </details>
              {(panel==="exit"||panel==="recovery")&&fillId?<details className="match-detail"><summary>Save or restore my private recovery secret</summary><p>Keep this browser session open or save a recovery file. Share only the public request with other participants.</p><label>Restore private recovery file<input type="file" accept="application/json" onChange={event=>void run(async()=>{
 const file=event.target.files?.[0];if(!file)return;if(file.size>10000)throw new Error("Recovery file is too large.");
 const backup=JSON.parse(await file.text()) as {fillId:string;secret:Hex};
 const card=historyCards.find(item=>item.fillId===backup.fillId)??readStored();
 if(!card?.input||card.fillId!==backup.fillId)throw new Error("Import the public request that belongs to this recovery file first.");
 if(!/^0x[0-9a-fA-F]{64}$/.test(backup.secret)||keccak256(encodeAbiParameters([{type:"bytes32"}],[backup.secret]))!==card.input.secretHash)throw new Error("Recovery secret does not match.");
 rememberQuote(JSON.stringify(card));sessionStorage.setItem("shift-secret:"+backup.fillId,backup.secret);setSecret(backup.secret);setStatus("Private recovery secret restored in this browser.");
})}/></label><label>Private recovery secret (exit wallet only)<input type="password" value={secret} onChange={event=>setSecret(event.target.value)} autoComplete="off"/></label><button className="btn" type="button" onClick={()=>{if(!secret){setStatus("No private secret in this browser. Restore it from your recovery file.");return;}const url=URL.createObjectURL(new Blob([JSON.stringify({fillId,secret})],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="shift-private-recovery.json";a.click();URL.revokeObjectURL(url);}}>Save private recovery file</button></details>:null}
              <details className="match-detail"><summary>Advanced quote settings</summary>
                <p>For coordinated testnet quotes, an LP can agree exact amounts instead of the current market reference.</p>
                <label className="match-checkbox"><input type="checkbox" checked={manualQuote} onChange={event=>setManualQuote(event.target.checked)}/>Use agreed LP amounts</label>
                <label>WHYPE size<input disabled={!!quoteSig} value={whypeText} onChange={event=>{setWhypeText(event.target.value);setManualQuote(true);}}/></label>
                {panel!=="exit"?<label>mUSDC<input disabled={!!quoteSig} value={usdcText} onChange={event=>setUsdcText(event.target.value)}/></label>:null}
                <label>Elysium gas<input disabled={!!quoteSig} value={gasEText} onChange={event=>setGasEText(event.target.value)}/></label>
                <label>HyperEVM gas<input disabled={!!quoteSig} value={gasHText} onChange={event=>setGasHText(event.target.value)}/></label>
                <button className="btn" type="button" disabled={!!quoteSig} onClick={()=>void run(useMarketQuote)}>Update market reference</button><p>{marketStatus}</p>
                <label>LP position<input value={position} onChange={event=>usePosition(event.target.value)}/></label>
                <p>Source {short(matchDeployments.sourceMatch)} · Destination {short(matchDeployments.destMatch)}</p>
              </details>
              <button className="btn quiet" type="button" onClick={()=>{localStorage.removeItem("shift-match-quote");setQuoteSig("");setQuoteCard("");setFillId("");setSecret("");setProgress({source:0,dest:0,credit:0n});}}>Start new request</button>
            </fieldset></div>
            <aside className="match-guide">
              <h2>{panel==="exit"?"What happens to your funds":panel==="deposit"?"What you are agreeing to":panel==="lp"?"How your position earns":"Choose the action for your current state"}</h2>
              <ol><li><strong>Review</strong><p>Check the amount you send, the chain you receive on and the fees before signing.</p></li><li><strong>Commit</strong><p>The exit's USDC and LP inventory reserve together. The incoming participant then locks HyperEVM HYPE.</p></li><li><strong>Receive</strong><p>The exit claims HyperEVM HYPE. Settlement pays the LP and the incoming participant on Elysium.</p></li></ol>
              <div className="match-fee-note"><span>Protocol fee</span><strong>{quote?formatEther(quote.fee):"—"} HYPE</strong><p>Gas is quoted separately. LP bonus comes from the protocol fee after a successful settlement.</p></div>
              {quoteSig?<div className="match-fee-note"><span>Signed LP bonus</span><strong>{quote?formatEther(quote.bonus):"—"} HYPE</strong></div>:null}
              {connectedAddress?<p className="match-connected">Connected wallet<br/><code>{short(connectedAddress)}</code></p>:null}
              <a href="/docs/match">Read how settlement and recovery work →</a>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );

  async function withdrawOrDeposit(kind: "deposit" | "withdraw") {
    const client = await connect(elysiumTestnet);
    const account = client?.account?.address;
    if (!client || !account || !deployed) return;
    const amount = parseEther(whypeText || "0");
    if (kind === "deposit") {
      const allowance = await elysium.readContract({
        address: matchDeployments.whype,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, position],
      });
      if (allowance < amount) {
        const hash = await client.writeContract({
          address: matchDeployments.whype,
          abi: erc20Abi,
          functionName: "approve",
          args: [position, amount],
          account,
          chain: elysiumTestnet,
        });
        await confirmed(elysium, hash);
      }
    }
    setStatus(
      kind === "deposit" ? "Depositing WHYPE…" : "Withdrawing available WHYPE…",
    );
    const hash = await client.writeContract({
      address: position,
      abi: positionAbi,
      functionName: kind === "deposit" ? "deposit" : "withdraw",
      args: kind === "deposit" ? [amount] : [amount, 0n],
      account,
      chain: elysiumTestnet,
    });
    await confirmed(elysium, hash);
    setStatus(`${kind} confirmed.`);
  }
}

function short(address: Address) {
  return address === ZERO
    ? "not deployed"
    : `${address.slice(0, 6)}…${address.slice(-4)}`;
}


function storedInput(card: StoredQuote): FundInput {
  const v = card.input;
  if (!v || card.version !== 2) throw new Error("Import a version 2 quote.");
  return {
    depositor: v.depositor as Address,
    recipient: v.recipient as Address,
    exitUser: v.exitUser as Address,
    usdc: BigInt(v.usdc),
    whype: BigInt(v.whype),
    secretHash: v.secretHash as Hex,
    claimBefore: BigInt(v.claimBefore),
    refundAfter: BigInt(v.refundAfter),
    gasElysium: BigInt(v.gasElysium),
    gasHyper: BigInt(v.gasHyper),
    quotedAt: BigInt(v.quotedAt),
    direction: Number(v.direction),
    nonce: BigInt(v.nonce),
    expectedBonus: BigInt(v.expectedBonus),
  };
}
async function confirmed(client: PublicClient, hash: Hex) {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error("Transaction reverted. No successful action was recorded.");
  return receipt;
}
