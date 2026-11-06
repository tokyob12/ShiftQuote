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
  type Address,
  type Chain,
  type Hex,
  type WalletClient,
} from "viem";
import { faucetAbi } from "./abi";
import { elysiumTestnet, hyperEvmTestnet, rpcUrl } from "./chain";
import { Logo } from "./Logo";
import { matchDeployments } from "./matchDeployments";
import "./match.css";
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

const sourceAbi = [
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "position", type: "address" },
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "depositor", type: "address" },
          { name: "recipient", type: "address" },
          { name: "usdc", type: "uint256" },
          { name: "whype", type: "uint256" },
          { name: "secretHash", type: "bytes32" },
          { name: "claimBefore", type: "uint64" },
          { name: "refundAfter", type: "uint64" },
          { name: "exitUser", type: "address" },
          { name: "gasElysium", type: "uint256" },
          { name: "gasHyper", type: "uint256" },
          { name: "quotedAt", type: "uint64" },
          { name: "direction", type: "uint8" },
          { name: "nonce", type: "uint256" },
        ],
      },
      { name: "quoteSig", type: "bytes" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "hashFill",
    stateMutability: "view",
    inputs: [
      { name: "position", type: "address" },
      { name: "exitUser", type: "address" },
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "depositor", type: "address" },
          { name: "recipient", type: "address" },
          { name: "usdc", type: "uint256" },
          { name: "whype", type: "uint256" },
          { name: "secretHash", type: "bytes32" },
          { name: "claimBefore", type: "uint64" },
          { name: "refundAfter", type: "uint64" },
          { name: "exitUser", type: "address" },
          { name: "gasElysium", type: "uint256" },
          { name: "gasHyper", type: "uint256" },
          { name: "quotedAt", type: "uint64" },
          { name: "direction", type: "uint8" },
          { name: "nonce", type: "uint256" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fillId", type: "bytes32" },
      { name: "secret", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "fillId", type: "bytes32" }],
    outputs: [],
  },
] as const;

const positionAbi = [
  { type: "function", name: "available", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "quoteNonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "signer", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "whypeAmount", type: "uint256" },
      { name: "usdcAmount", type: "uint256" },
    ],
    outputs: [],
  },
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

const quoteTypes = {
  Quote: [
    { name: "position", type: "address" },
    { name: "exitUser", type: "address" },
    { name: "usdc", type: "uint256" },
    { name: "whype", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "quotedAt", type: "uint64" },
    { name: "direction", type: "uint8" },
  ],
} as const;

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
};

function panelFrom(path: string) {
  if (path.startsWith(`${matchPath}/deposit`)) return "deposit";
  if (path.startsWith(`${matchPath}/lp`)) return "lp";
  if (path.startsWith(`${matchPath}/recovery`)) return "recovery";
  return "exit";
}

export function quoteMatch(whype: bigint, gasElysium: bigint, gasHyper: bigint) {
  const fee = (whype * PROTOCOL_FEE_BPS) / BPS;
  const bonus = (fee * BONUS_OF_FEE_BPS) / BPS;
  const payment = (whype * (BPS - EXIT_FEE_BPS)) / BPS;
  return { fee, bonus, shift: fee - bonus, payment, lock: payment + gasHyper, depositorOut: whype - fee - gasElysium };
}

function freshSecret(): { secret: Hex; secretHash: Hex } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret = `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}` as Hex;
  const secretHash = keccak256(encodeAbiParameters([{ type: "bytes32" }], [secret]));
  return { secret, secretHash };
}

const destAbi = [
  {
    type: "function",
    name: "lock",
    stateMutability: "payable",
    inputs: [
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "sourceChainId", type: "uint256" },
          { name: "source", type: "address" },
          { name: "position", type: "address" },
          { name: "exitUser", type: "address" },
          { name: "recipient", type: "address" },
          { name: "usdc", type: "uint256" },
          { name: "whype", type: "uint256" },
          { name: "secretHash", type: "bytes32" },
          { name: "claimBefore", type: "uint64" },
          { name: "refundAfter", type: "uint64" },
          { name: "gasElysium", type: "uint256" },
          { name: "gasHyper", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "quotedAt", type: "uint64" },
          { name: "direction", type: "uint8" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fillId", type: "bytes32" },
      { name: "secret", type: "bytes32" },
    ],
    outputs: [],
  },
  { type: "function", name: "take", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "fillId", type: "bytes32" }],
    outputs: [],
  },
] as const;

const factoryAbi = [
  { type: "function", name: "create", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "event",
    name: "Created",
    inputs: [
      { name: "position", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

const whypeAbi = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
] as const;

type StoredQuote = {
  signature?: string;
  secret?: string;
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
    return parsed.input ? parsed : null;
  } catch {
    return null;
  }
}

const elysium = createPublicClient({ chain: elysiumTestnet, transport: http(rpcUrl) });
const hyper = createPublicClient({
  chain: hyperEvmTestnet,
  transport: http(hyperEvmTestnet.rpcUrls.default.http[0]),
});

export function Match() {
  const path = usePath();
  const panel = panelFrom(path);
  const deployed = matchDeployments.sourceMatch !== ZERO && matchDeployments.factory !== ZERO;
  const [whypeText, setWhypeText] = useState("0.05");
  const [usdcText, setUsdcText] = useState("4");
  const [gasEText, setGasEText] = useState("0");
  const [gasHText, setGasHText] = useState("0");
  const [depositor, setDepositor] = useState("");
  const [exitUser, setExitUser] = useState("");
  const [quoteSig, setQuoteSig] = useState("");
  const [fillId, setFillId] = useState("");
  const [secret, setSecret] = useState("");
  const [quoteCard, setQuoteCard] = useState("");
  const [position, setPosition] = useState<Address>(matchDeployments.position);
  const [account, setAccount] = useState<Address | null>(null);
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [available, setAvailable] = useState<bigint | null>(null);
  const [status, setStatus] = useState(
    deployed ? "Connect a wallet on Elysium testnet." : "Elysium Match is not deployed.",
  );

  const quote = useMemo(() => {
    try {
      const whype = parseEther(whypeText || "0");
      const gasE = parseEther(gasEText || "0");
      const gasH = parseEther(gasHText || "0");
      if (whype < parseEther("0.001") || gasE + (whype * PROTOCOL_FEE_BPS) / BPS >= whype) return null;
      return quoteMatch(whype, gasE, gasH);
    } catch {
      return null;
    }
  }, [whypeText, gasEText, gasHText]);

  useEffect(() => {
    const savedPosition = localStorage.getItem("shift-match-position");
    const parsed = readStored();
    const nextPosition = parsed?.position || savedPosition;
    if (nextPosition && isAddress(nextPosition)) setPosition(nextPosition);
    if (!parsed) return;
    setQuoteCard(JSON.stringify(parsed, null, 2));
    if (parsed.signature) setQuoteSig(parsed.signature);
    if (parsed.secret) setSecret(parsed.secret);
    if (parsed.fillId) setFillId(parsed.fillId);
    if (parsed.input?.depositor) setDepositor(parsed.input.depositor);
    if (parsed.input?.exitUser) setExitUser(parsed.input.exitUser);
    if (parsed.input?.whype) setWhypeText(formatEther(BigInt(parsed.input.whype)));
    if (parsed.input?.usdc) setUsdcText(formatUnits(BigInt(parsed.input.usdc), 6));
    if (parsed.input?.gasElysium) setGasEText(formatEther(BigInt(parsed.input.gasElysium)));
    if (parsed.input?.gasHyper) setGasHText(formatEther(BigInt(parsed.input.gasHyper)));
  }, []);

  useEffect(() => {
    if (!deployed || !isAddress(position)) return;
    void elysium
      .readContract({ address: position, abi: positionAbi, functionName: "available" })
      .then(setAvailable)
      .catch(() => setAvailable(null));
  }, [deployed, position, status]);

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
          blockExplorerUrls: [chain.blockExplorers?.default.url].filter(Boolean),
        },
      ],
    });
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
    const next = accounts[0] as Address;
    const client = createWalletClient({ account: next, chain, transport: custom(window.ethereum) });
    setAccount(next);
    setWallet(client);
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
        secretHash: (secret.startsWith("0x") && secret.length === 66
          ? keccak256(encodeAbiParameters([{ type: "bytes32" }], [secret as Hex]))
          : freshSecret().secretHash),
        claimBefore,
        refundAfter: claimBefore + 2n * 60n * 60n,
        exitUser: exit,
        gasElysium: parseEther(gasEText || "0"),
        gasHyper: parseEther(gasHText || "0"),
        quotedAt: now,
        direction: 1,
        nonce: nonceValue,
      };
    } catch {
      return null;
    }
  }

  async function signQuote() {
    const client = wallet ?? (await connect(elysiumTestnet));
    if (!client || !account || !deployed || !isAddress(position)) return;
    const exit = (exitUser || account) as Address;
    const nonceValue = await elysium.readContract({
      address: position,
      abi: positionAbi,
      functionName: "quoteNonce",
    });
    const made = secret.length === 66 ? { secret: secret as Hex, secretHash: keccak256(encodeAbiParameters([{ type: "bytes32" }], [secret as Hex])) } : freshSecret();
    const input = buildInput(exit, nonceValue);
    if (!input || !isAddress(input.depositor) || !isAddress(input.exitUser)) {
      setStatus("Set the depositor and exit wallet addresses before signing.");
      return;
    }
    input.secretHash = made.secretHash;
    setSecret(made.secret);
    setStatus("Waiting for the LP signature…");
    const signature = await client.signTypedData({
      account,
      domain: { name: "Shift Match", version: "1", chainId: elysiumTestnet.id, verifyingContract: matchDeployments.sourceMatch },
      types: quoteTypes,
      primaryType: "Quote",
      message: {
        position,
        exitUser: input.exitUser,
        usdc: input.usdc,
        whype: input.whype,
        nonce: input.nonce,
        quotedAt: input.quotedAt,
        direction: input.direction,
      },
    });
    const id = await elysium.readContract({
      address: matchDeployments.sourceMatch,
      abi: sourceAbi,
      functionName: "hashFill",
      args: [position, input.exitUser, input],
    });
    const card: StoredQuote = {
      signature,
      secret: made.secret,
      position,
      fillId: id,
      input: {
        ...input,
        secretHash: input.secretHash,
        usdc: input.usdc.toString(),
        whype: input.whype.toString(),
        claimBefore: input.claimBefore.toString(),
        refundAfter: input.refundAfter.toString(),
        gasElysium: input.gasElysium.toString(),
        gasHyper: input.gasHyper.toString(),
        quotedAt: input.quotedAt.toString(),
        nonce: input.nonce.toString(),
        direction: String(input.direction),
        depositor: input.depositor,
        exitUser: input.exitUser,
        recipient: input.recipient,
      },
    };
    const text = JSON.stringify(card, null, 2);
    localStorage.setItem("shift-match-quote", text);
    setQuoteSig(signature);
    setFillId(id);
    setQuoteCard(text);
    setStatus("Quote signed. Copy the quote card to the exit wallet and the depositor. Fund it within 10 minutes.");
  }

  async function fund() {
    const client = wallet ?? (await connect(elysiumTestnet));
    if (!client || !account || !deployed || !quote) return;
    const saved = localStorage.getItem("shift-match-quote");
    const parsed = saved ? (JSON.parse(saved) as StoredQuote) : {};
    const signature = (quoteSig || parsed.signature || "") as Hex;
    if (!signature.startsWith("0x") || !parsed.input) {
      setStatus("The LP has to sign this quote first. The signature expires in 10 minutes.");
      return;
    }
    const stored = parsed.input;
    let input: FundInput = {
      depositor: stored.depositor as Address,
      recipient: account,
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
    };
    if (stored.exitUser.toLowerCase() !== account.toLowerCase()) {
      setStatus("Connect the exit wallet that was signed into this quote.");
      return;
    }
    if (parsed.secret) setSecret(parsed.secret);
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
      await elysium.waitForTransactionReceipt({ hash });
    }
    const signedPosition = parsed.position && isAddress(parsed.position) ? parsed.position : position;
    setStatus("Funding the exit…");
    const hash = await client.writeContract({
      address: matchDeployments.sourceMatch,
      abi: sourceAbi,
      functionName: "fund",
      args: [signedPosition, input, signature],
      account,
      chain: elysiumTestnet,
    });
    const receipt = await elysium.waitForTransactionReceipt({ hash });
    setStatus(`Funded in ${receipt.transactionHash}. Save the secret shown on this page.`);
  }

  async function drip() {
    const client = wallet ?? (await connect(elysiumTestnet));
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
    await elysium.waitForTransactionReceipt({ hash });
    setStatus("Faucet confirmed. It sends SDA and mUSDC, then waits one hour.");
  }

  async function lock() {
    const client = await connect(hyperEvmTestnet);
    if (!client || !account || matchDeployments.destMatch === ZERO) return;
    const saved = localStorage.getItem("shift-match-quote");
    const parsed = saved ? (JSON.parse(saved) as StoredQuote) : {};
    const stored = parsed.input;
    if (!stored?.depositor) {
      setStatus("The LP has to sign this quote first. Lock uses that signed fill.");
      return;
    }
    if (stored.depositor.toLowerCase() !== account.toLowerCase()) {
      setStatus("Connect the depositor wallet named in the signed quote.");
      return;
    }
    const whype = BigInt(stored.whype);
    const gasHyper = BigInt(stored.gasHyper);
    const value = (whype * (BPS - EXIT_FEE_BPS)) / BPS + gasHyper;
    if (parsed.secret) setSecret(parsed.secret);
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
          position: parsed.position && isAddress(parsed.position) ? parsed.position : position,
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
          quotedAt: BigInt(stored.quotedAt),
          direction: Number(stored.direction),
        },
      ],
      account,
      chain: hyperEvmTestnet,
    });
    const receipt = await hyper.waitForTransactionReceipt({ hash });
    if (parsed.fillId) setFillId(parsed.fillId);
    setStatus(`Locked on HyperEVM in ${receipt.transactionHash}. The exit wallet can claim with the secret.`);
  }

  function rememberQuote(raw: string) {
    setQuoteCard(raw);
    const parsed = JSON.parse(raw) as StoredQuote;
    if (!parsed.input) throw new Error("Paste the signed quote card.");
    localStorage.setItem("shift-match-quote", JSON.stringify(parsed));
    if (parsed.signature) setQuoteSig(parsed.signature);
    if (parsed.secret) setSecret(parsed.secret);
    if (parsed.fillId) setFillId(parsed.fillId);
    if (parsed.position && isAddress(parsed.position)) {
      setPosition(parsed.position);
      localStorage.setItem("shift-match-position", parsed.position);
    }
    if (parsed.input.depositor) setDepositor(parsed.input.depositor);
    if (parsed.input.exitUser) setExitUser(parsed.input.exitUser);
    setStatus("Quote card loaded. Fund from the exit wallet, then lock from the depositor wallet.");
  }

  function usePosition(next: string) {
    setPosition(next as Address);
    if (isAddress(next)) localStorage.setItem("shift-match-position", next);
  }

  async function createPosition() {
    const client = wallet ?? (await connect(elysiumTestnet));
    if (!client || !account) return;
    setStatus("Creating your LP position…");
    const hash = await client.writeContract({
      address: matchDeployments.factory,
      abi: factoryAbi,
      functionName: "create",
      account,
      chain: elysiumTestnet,
    });
    const receipt = await elysium.waitForTransactionReceipt({ hash });
    const created = receipt.logs
      .map((log) => {
        try {
          return decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
        } catch {
          return null;
        }
      })
      .find((log) => log?.eventName === "Created");
    if (!created || created.eventName !== "Created") {
      setStatus("The position transaction landed, but its address was not in the receipt.");
      return;
    }
    usePosition(created.args.position);
    setStatus(`Position ${created.args.position} is yours. Wrap HYPE, then deposit it.`);
  }

  async function wrapWhype() {
    const client = wallet ?? (await connect(elysiumTestnet));
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
    await elysium.waitForTransactionReceipt({ hash });
    setStatus("WHYPE is in this wallet. Deposit it into your position.");
  }

  async function hyperMove(kind: "claim" | "take" | "refund") {
    const client = await connect(hyperEvmTestnet);
    if (!client || !account) return;
    if (kind !== "take" && !fillId.startsWith("0x")) {
      setStatus("Paste the quote card so the fill id is loaded.");
      return;
    }
    if (kind === "claim" && !secret.startsWith("0x")) {
      setStatus("Paste the secret from the quote card.");
      return;
    }
    setStatus(kind === "claim" ? "Claiming on HyperEVM…" : kind === "take" ? "Taking credited HYPE…" : "Refunding the HyperEVM lock…");
    const hash = await client.writeContract({
      address: matchDeployments.destMatch,
      abi: destAbi,
      functionName: kind,
      args: kind === "claim" ? [fillId as Hex, secret as Hex] : kind === "refund" ? [fillId as Hex] : [],
      account,
      chain: hyperEvmTestnet,
    });
    await hyper.waitForTransactionReceipt({ hash });
    setStatus(
      kind === "claim"
        ? "Claim credited the HYPE. Take credited HYPE to receive it."
        : kind === "take"
          ? "Credited HYPE was sent to this wallet."
          : "HyperEVM lock credited the depositor. Take credited HYPE to receive it.",
    );
  }

  async function settleOrRefund(kind: "settle" | "refund") {
    const client = wallet ?? (await connect(elysiumTestnet));
    if (!client || !account || !deployed) return;
    if (!fillId.startsWith("0x")) {
      setStatus("Paste the fill id.");
      return;
    }
    setStatus(kind === "settle" ? "Settling…" : "Refunding…");
    const hash = await client.writeContract({
      address: matchDeployments.sourceMatch,
      abi: sourceAbi,
      functionName: kind,
      args: kind === "settle" ? [fillId as Hex, secret as Hex] : [fillId as Hex],
      account,
      chain: elysiumTestnet,
    });
    await elysium.waitForTransactionReceipt({ hash });
    setStatus(`${kind} confirmed.`);
  }

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The transaction failed.");
    }
  }

  return (
    <div className="match-page">
      <header className="match-bar">
        <a className="brand" href="/" aria-label="Shift home">
          <Logo />
        </a>
        <nav className="match-nav" aria-label="Match">
          {panels.map((item) => (
            <a key={item.href} href={item.href} aria-current={panelFrom(item.href) === panel ? "page" : undefined}>
              {item.label}
            </a>
          ))}
          <a href={deskPath}>Desk</a>
        </nav>
      </header>
      <main>
        <TestnetNote text="Match on Elysium testnet uses mUSDC and WHYPE. The HyperEVM lock is deployed. A claimed destination is not an unconditional Elysium refund." />
        <section className="match-quote">
          <h1>{panel === "exit" ? "Exit to HYPE" : panel === "deposit" ? "Deposit HYPE" : panel === "lp" ? "LP inventory" : "Recovery"}</h1>
          <p className="match-notice">
            {available === null ? "LP inventory is unread." : `LP available: ${formatEther(available)} WHYPE.`} Position {short(position)}. Source {short(matchDeployments.sourceMatch)}.
          </p>
          <div className="match-fields">
            <label>
              WHYPE size
              <input value={whypeText} onChange={(event) => setWhypeText(event.target.value)} inputMode="decimal" />
            </label>
            <label>
              mUSDC
              <input value={usdcText} onChange={(event) => setUsdcText(event.target.value)} inputMode="decimal" />
            </label>
            <label>
              Elysium gas
              <input value={gasEText} onChange={(event) => setGasEText(event.target.value)} inputMode="decimal" />
            </label>
            <label>
              HyperEVM gas
              <input value={gasHText} onChange={(event) => setGasHText(event.target.value)} inputMode="decimal" />
            </label>
          </div>
          {quote ? (
            <dl>
              <div>
                <dt>HyperEVM HYPE</dt>
                <dd>{formatEther(quote.payment)}</dd>
              </div>
              <div>
                <dt>Depositor locks</dt>
                <dd>{formatEther(quote.lock)}</dd>
              </div>
              <div>
                <dt>Depositor receives</dt>
                <dd>{formatEther(quote.depositorOut)} WHYPE</dd>
              </div>
              <div>
                <dt>LP bonus / Shift</dt>
                <dd>
                  {formatEther(quote.bonus)} / {formatEther(quote.shift)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="match-notice">Enter at least 0.001 WHYPE with room for the fee and gas.</p>
          )}
          <ol className="match-steps">
            <li>LP: create a position, wrap HYPE, deposit WHYPE, then sign. Copy the quote card.</li>
            <li>Exit wallet: paste the card, get test mUSDC, and fund within 10 minutes.</li>
            <li>Depositor: paste the card and lock the HYPE amount shown above on HyperEVM.</li>
            <li>Exit wallet: claim with the secret, then take the credited HYPE.</li>
            <li>Anyone can settle on Elysium with the secret. After the deadline, refund is on Recovery.</li>
          </ol>
          <label>
            Quote card
            <textarea
              value={quoteCard}
              onChange={(event) => {
                const raw = event.target.value;
                setQuoteCard(raw);
                if (raw.trim().startsWith("{")) {
                  try {
                    rememberQuote(raw);
                  } catch {
                    setStatus("The quote card is not valid JSON yet.");
                  }
                }
              }}
              spellCheck={false}
              placeholder="The signed quote appears here. Paste it on the other wallets."
            />
          </label>
          <p className="match-status">{status}</p>
          {panel === "exit" ? (
            <div className="match-actions">
              <label>
                Depositor
                <input value={depositor} onChange={(event) => setDepositor(event.target.value)} placeholder="0x" />
              </label>
              <button className="btn" type="button" onClick={() => void run(drip)}>
                Get test mUSDC
              </button>
              <button className="btn" type="button" onClick={() => void run(fund)}>
                Fund this exit
              </button>
              <button className="btn" type="button" onClick={() => void run(() => hyperMove("claim"))}>
                Claim HYPE
              </button>
              <button className="btn" type="button" onClick={() => void run(() => hyperMove("take"))}>
                Take credited HYPE
              </button>
            </div>
          ) : null}
          {panel === "deposit" ? (
            <div className="match-actions">
              <p>
                DestMatch {short(matchDeployments.destMatch)} is on HyperEVM testnet. Lock sends the HYPE amount above from the depositor named in the quote card. This address is the same text as Elysium mUSDC, and it is a different contract.
              </p>
              <button className="btn" type="button" onClick={() => void run(lock)}>
                Lock this HYPE
              </button>
            </div>
          ) : null}
          {panel === "lp" ? (
            <div className="match-actions">
              <label>
                Position
                <input value={position} onChange={(event) => usePosition(event.target.value)} placeholder="0x" />
              </label>
              <label>
                Exit user
                <input value={exitUser} onChange={(event) => setExitUser(event.target.value)} placeholder="0x" />
              </label>
              <label>
                Depositor
                <input value={depositor} onChange={(event) => setDepositor(event.target.value)} placeholder="0x" />
              </label>
              <button className="btn" type="button" onClick={() => void connect(elysiumTestnet)}>
                Connect LP wallet
              </button>
              <button className="btn" type="button" onClick={() => void run(createPosition)}>
                Create my position
              </button>
              <button className="btn" type="button" onClick={() => void run(wrapWhype)}>
                Wrap HYPE
              </button>
              <button className="btn" type="button" onClick={() => void run(signQuote)}>
                Sign quote
              </button>
              <button className="btn" type="button" onClick={() => void run(() => withdrawOrDeposit("deposit"))}>
                Deposit WHYPE
              </button>
              <button className="btn" type="button" onClick={() => void run(() => withdrawOrDeposit("withdraw"))}>
                Withdraw available
              </button>
            </div>
          ) : null}
          {panel === "recovery" ? (
            <div className="match-actions">
              <p className="match-notice">Fill {fillId ? short(fillId as Address) : "appears after the LP signs"}.</p>
              <button className="btn" type="button" onClick={() => void run(() => settleOrRefund("settle"))}>
                Settle on Elysium
              </button>
              <button className="btn" type="button" onClick={() => void run(() => settleOrRefund("refund"))}>
                Refund Elysium
              </button>
              <button className="btn" type="button" onClick={() => void run(() => hyperMove("claim"))}>
                Claim HYPE
              </button>
              <button className="btn" type="button" onClick={() => void run(() => hyperMove("take"))}>
                Take credited HYPE
              </button>
              <button className="btn" type="button" onClick={() => void run(() => hyperMove("refund"))}>
                Refund HyperEVM lock
              </button>
            </div>
          ) : null}
          {secret ? <p className="match-notice">Secret, keep it off the URL: {secret}</p> : null}
          {usdcText ? <p className="match-notice">Quote notion is {usdcText} mUSDC ({formatUnits(parseUnits(safeUnits(usdcText), 6), 6)}).</p> : null}
        </section>
      </main>
      <SiteFooter />
    </div>
  );

  async function withdrawOrDeposit(kind: "deposit" | "withdraw") {
    const client = wallet ?? (await connect(elysiumTestnet));
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
        await elysium.waitForTransactionReceipt({ hash });
      }
    }
    setStatus(kind === "deposit" ? "Depositing WHYPE…" : "Withdrawing available WHYPE…");
    const hash = await client.writeContract({
      address: position,
      abi: positionAbi,
      functionName: kind === "deposit" ? "deposit" : "withdraw",
      args: kind === "deposit" ? [amount] : [amount, 0n],
      account,
      chain: elysiumTestnet,
    });
    await elysium.waitForTransactionReceipt({ hash });
    setStatus(`${kind} confirmed.`);
  }
}

function short(address: Address) {
  return address === ZERO ? "not deployed" : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function safeUnits(value: string) {
  return value.trim() === "" ? "0" : value;
}
