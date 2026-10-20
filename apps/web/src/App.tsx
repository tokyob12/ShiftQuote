import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { bookAbi, erc20Abi, faucetAbi, positionAbi } from "./abi";
import { elysiumTestnet, rpcUrl } from "./chain";
import { deployments } from "./deployments";
import { Ladder, Route, statusTone, Ticker } from "./DeskParts";
import { Logo } from "./Logo";
import { TestnetNote } from "./site";
import "./desk.css";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const LOCATIONS = ["Uninitialized", "Quoted", "Pulled", "InTransit", "OnCoreIdle", "Resting"] as const;
const DECISIONS = ["None", "Stay", "Pull", "Shift"] as const;

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type PositionView = {
  owner: Address;
  reader: Address;
  location: number;
  lastDecision: number;
  quotedMidX18: bigint;
  spotLinked: boolean;
  elysiumBase: bigint;
  elysiumQuote: bigint;
  transitBase: bigint;
  coreIdleBase: bigint;
  restingBase: bigint;
  bandBps: bigint;
  preview: string;
  bookAge: string;
  scripted: boolean;
};

type Level = { px: string; sz: string };

const publicClient = createPublicClient({
  chain: elysiumTestnet,
  transport: http(rpcUrl),
});

const deployed = deployments.position !== ZERO;

function formatUnits(value: bigint, decimals: number, digits = 4): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, "0").slice(0, digits);
  return `${whole.toString()}.${frac}`;
}

function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (trimmed === "") return 0n;
  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

function short(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function App() {
  const [account, setAccount] = useState<Address | null>(null);
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [position, setPosition] = useState<PositionView | null>(null);
  const [keeperText, setKeeperText] = useState("No keeper snapshot yet.");
  const [levels, setLevels] = useState<{ bids: Level[]; asks: Level[] } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [bookError, setBookError] = useState("");
  const [status, setStatus] = useState("");
  const [baseIn, setBaseIn] = useState("100");
  const [quoteIn, setQuoteIn] = useState("100");
  const [swapSize, setSwapSize] = useState("1");
  const [bid, setBid] = useState("0.99");
  const [ask, setAsk] = useState("1.01");
  const [slippage, setSlippage] = useState("10");

  const refresh = useCallback(async () => {
    if (!deployed) return;
    try {
    const block = await publicClient.getBlock();
    const calls = [
      "owner",
      "reader",
      "location",
      "lastDecision",
      "quotedMidX18",
      "spotLinked",
      "elysiumBase",
      "elysiumQuote",
      "transitBase",
      "coreIdleBase",
      "restingBase",
      "BAND_BPS",
    ] as const;
    const results = await publicClient.multicall({
      contracts: calls.map((functionName) => ({
        address: deployments.position,
        abi: positionAbi,
        functionName,
      })),
    });
    const value = <T,>(index: number): T => {
      const item = results[index];
      if (item.status !== "success") throw new Error(`${calls[index]} failed`);
      return item.result as T;
    };
    const reader = value<Address>(1);
    const location = Number(value<number>(2));
    const quotedMidX18 = value<bigint>(4);
    let preview = "No live decision.";
    let bookAge = "—";
    if (location === 1 || location === 2) {
      try {
        const previewResult = await publicClient.readContract({
          address: deployments.position,
          abi: positionAbi,
          functionName: "preview",
        });
        const [decision, mid, slippageBps, timestamp] = previewResult;
        const age = Math.max(0, Number(block.timestamp) - Number(timestamp));
        preview = `${DECISIONS[Number(decision)]} at ${formatUnits(mid, 18)} USDC, slippage ${slippageBps.toString()} bps`;
        bookAge = `${age}s`;
      } catch (error) {
        preview = error instanceof Error ? error.message : "Book read failed";
      }
    }
    setPosition({
      owner: value(0),
      reader,
      location,
      lastDecision: Number(value<number>(3)),
      quotedMidX18,
      spotLinked: value(5),
      elysiumBase: value(6),
      elysiumQuote: value(7),
      transitBase: value(8),
      coreIdleBase: value(9),
      restingBase: value(10),
      bandBps: value(11),
      preview,
      bookAge,
      scripted: reader.toLowerCase() === deployments.scriptedBook.toLowerCase(),
    });

    try {
      const snap = await publicClient.readContract({
        address: deployments.keeperBook,
        abi: bookAbi,
        functionName: "read",
        args: [0n],
      });
      setKeeperText(
        `On-chain ETH snapshot: mid ${formatUnits(snap.midX18, 18)} USDC, slippage ${snap.slippageBps.toString()} bps, age ${Math.max(0, Number(block.timestamp) - Number(snap.timestamp))}s.`,
      );
    } catch {
      setKeeperText("Keeper snapshot is missing or older than 15 seconds.");
    }
    setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not read the position");
    }
  }, []);

  const loadBook = useCallback(async () => {
    try {
      const response = await fetch("/hl/info", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "l2Book", coin: "ETH" }),
      });
      if (!response.ok) throw new Error(`Book request failed (${response.status})`);
      const body = (await response.json()) as { levels: [Level[], Level[]] };
      setLevels({ bids: body.levels[0].slice(0, 5), asks: body.levels[1].slice(0, 5) });
      setBookError("");
    } catch (error) {
      setBookError(error instanceof Error ? error.message : "Could not read the ETH book");
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadBook();
    const timer = setInterval(() => {
      void refresh();
      void loadBook();
    }, 4000);
    return () => clearInterval(timer);
  }, [refresh, loadBook]);

  async function connect() {
    if (!window.ethereum) {
      setStatus("No wallet found in this browser.");
      return;
    }
    const chainId = `0x${elysiumTestnet.id.toString(16)}`;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: elysiumTestnet.name,
          nativeCurrency: elysiumTestnet.nativeCurrency,
          rpcUrls: [rpcUrl],
          blockExplorerUrls: [elysiumTestnet.blockExplorers.default.url],
        },
      ],
    });
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
    const next = accounts[0] as Address;
    setAccount(next);
    setWallet(
      createWalletClient({
        account: next,
        chain: elysiumTestnet,
        transport: custom(window.ethereum),
      }),
    );
  }

  async function write(
    address: Address,
    abi: typeof positionAbi | typeof bookAbi | typeof erc20Abi | typeof faucetAbi,
    functionName: string,
    args: readonly unknown[],
  ): Promise<boolean> {
    if (!wallet || !account) {
      setStatus("Connect the LP wallet first.");
      return false;
    }
    setStatus(`Sending ${functionName}…`);
    try {
      const hash = await wallet.writeContract({
        address,
        abi,
        functionName,
        args,
        account,
        chain: elysiumTestnet,
      } as never);
      setStatus(`Waiting for ${functionName}…`);
      await (publicClient as PublicClient).waitForTransactionReceipt({ hash });
      setStatus(`${functionName} confirmed.`);
      await refresh();
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${functionName} failed`);
      return false;
    }
  }

  const isOwner = account !== null && position !== null && account.toLowerCase() === position.owner.toLowerCase();
  const locationName = position ? LOCATIONS[position.location] : "—";
  const canEvaluate = position?.location === 1 || position?.location === 2;
  const canShift = isOwner && position?.scripted && position.spotLinked && canEvaluate;
  const canAdvance = isOwner && position?.scripted && (position.location === 3 || position.location === 4);
  const canReturn =
    isOwner &&
    position?.scripted &&
    (position.transitBase > 0n || position.coreIdleBase > 0n || position.restingBase > 0n);

  const tone =
    position?.location === 1
      ? "quoted"
      : position?.location === 2
        ? "pulled"
        : position && position.location >= 3
          ? "scripted"
          : "idle";
  const nextTone = position ? position.preview.split(" ")[0] : "";
  const active = (locations: number[]) => (position && locations.includes(position.location) ? ` active ${tone}` : "");

  return (
    <div className="desk">
      <header className="desk-header">
        <a className="brand" href="/" aria-label="Shift home">
          <Logo />
        </a>
        <span className="chain">{elysiumTestnet.id}</span>
        <p className="sub">One LP position on Elysium testnet.</p>
        <nav className="desk-nav" aria-label="Site">
          <a href="/docs">Docs</a>
        </nav>
        <button className={account ? "connect on" : "connect primary"} type="button" onClick={() => void connect()}>
          {account ? short(account) : "Connect wallet"}
        </button>
      </header>

      <main>
        {!deployed && <p className="notice">Contracts are not deployed yet. The ETH book below is still live.</p>}
        <TestnetNote text="Scripted HyperCore leg. Tokens stay in this contract. This is not an order on HyperCore." />

        <div className="layout">
          <section className={`card position tone-${tone}`}>
            <div className="card-head">
              <h2>Position</h2>
              {position && (
                <p key={locationName} className={`location ${locationName}`}>
                  {locationName}
                </p>
              )}
            </div>
            {position ? (
              <>
                <Route location={position.location} />
                <div className="metrics">
                  <div className={`metric${active([1, 2])}`}>
                    <span className="metric-label">Elysium base</span>
                    <strong>
                      <Ticker value={formatUnits(position.elysiumBase, 18)} /> <span className="unit">SDA</span>
                    </strong>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Elysium quote</span>
                    <strong>
                      <Ticker value={formatUnits(position.elysiumQuote, 6)} />{" "}
                      <span className="unit">
                        {deployments.quoteSymbol}
                        {deployments.quoteIsMock ? " (mock)" : ""}
                      </span>
                    </strong>
                  </div>
                  <div className={`metric${active([3])}`}>
                    <span className="metric-label">In transit</span>
                    <strong>
                      <Ticker value={formatUnits(position.transitBase, 18)} /> <span className="unit">SDA</span>
                    </strong>
                  </div>
                  <div className={`metric${active([4])}`}>
                    <span className="metric-label">Core idle</span>
                    <strong>
                      <Ticker value={formatUnits(position.coreIdleBase, 18)} /> <span className="unit">SDA</span>
                    </strong>
                  </div>
                  <div className={`metric${active([5])}`}>
                    <span className="metric-label">Resting</span>
                    <strong>
                      <Ticker value={formatUnits(position.restingBase, 18)} /> <span className="unit">SDA</span>
                    </strong>
                  </div>
                </div>
                <p className="hint">Core rows are a scripted ledger. The base token never leaves the contract.</p>
                <dl className="facts">
                  <div>
                    <dt>Last decision</dt>
                    <dd className={`decision-word ${DECISIONS[position.lastDecision]}`}>{DECISIONS[position.lastDecision]}</dd>
                  </div>
                  <div>
                    <dt>Quoted mid</dt>
                    <dd>
                      <Ticker value={formatUnits(position.quotedMidX18, 18)} /> USDC
                    </dd>
                  </div>
                  <div>
                    <dt>Band</dt>
                    <dd>{position.bandBps.toString()} bps</dd>
                  </div>
                  <div>
                    <dt>Book age</dt>
                    <dd>{position.bookAge}</dd>
                  </div>
                  <div>
                    <dt>Spot linked</dt>
                    <dd>{position.spotLinked ? "Yes" : "No"}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="hint loading">{deployed ? loadError || "Reading the position…" : "Deploy to show a position."}</p>
            )}
          </section>

          <section className="card trade">
            <div className="card-head">
              <h2>Quote</h2>
            </div>
            {position ? (
              <>
                <div className="next">
                  <span className="next-label">Next decision</span>
                  <span key={position.preview} className={`next-value decision-word ${nextTone}`}>
                    {position.preview}
                  </span>
                </div>
                <div className="trade-bar">
                  <button
                    className="primary evaluate"
                    type="button"
                    disabled={!account || !canEvaluate}
                    onClick={() => void write(deployments.position, positionAbi, "evaluate", [])}
                  >
                    Evaluate
                  </button>
                  <label className="trade-size">
                    <span className="trade-label">Buy base</span>
                    <span className="trade-input">
                      <input inputMode="decimal" value={swapSize} onChange={(event) => setSwapSize(event.target.value)} />
                      <span className="trade-unit">SDA</span>
                    </span>
                  </label>
                  <button
                    className="primary swap"
                    type="button"
                    disabled={!account || position.location !== 1}
                    onClick={() => void approveAndSwap()}
                  >
                    Swap
                  </button>
                </div>
                <p className="hint">Swap is rejected while the position is Pulled. Quoted sells base at the quoted mid.</p>
              </>
            ) : (
              <p className="hint loading">{deployed ? loadError || "Reading the position…" : "Deploy to show a position."}</p>
            )}
          </section>

          <section className="card book">
            <div className="card-head">
              <h2>Live ETH book</h2>
              <span className={`live${bookError ? " off" : levels ? " on" : ""}`}>{bookError ? "Offline" : "Live"}</span>
            </div>
            <p className="hint">This is the HyperCore ETH book. It is not the demo token&apos;s market.</p>
            <p className="keeper">{keeperText}</p>
            {bookError && <p className="hint">{bookError}</p>}
            {levels && <Ladder asks={levels.asks} bids={levels.bids} />}
          </section>

          <section className="card tokens">
            <div className="card-head">
              <h2>Test tokens</h2>
            </div>
            <p className="hint">1,000 SDA and 1,000 mUSDC, once an hour. Swap spends mUSDC. Gas is still testnet HYPE.</p>
            <div className="row">
              <button
                className="primary"
                type="button"
                disabled={!account}
                onClick={() => void write(deployments.faucet, faucetAbi, "drip", [])}
              >
                Get test tokens
              </button>
            </div>
          </section>

          <section className="card owner">
            <div className="card-head">
              <h2>Owner</h2>
              <span className={`owner-tag${isOwner ? " on" : ""}`}>{isOwner ? "LP wallet connected" : "LP wallet only"}</span>
            </div>

            {position && (
              <div className="owner-block">
                <p className="block-label">Scripted leg</p>
                <div className="row secondary">
                  <button
                    type="button"
                    disabled={!isOwner}
                    onClick={() => void write(deployments.position, positionAbi, "setSpotLinked", [!position.spotLinked])}
                  >
                    {position.spotLinked ? "Unlink spot" : "Link spot"}
                  </button>
                  <button
                    className="shift-action"
                    type="button"
                    disabled={!canShift}
                    onClick={() => void write(deployments.position, positionAbi, "shift", [])}
                  >
                    Shift 25%
                  </button>
                  <button
                    type="button"
                    disabled={!canAdvance}
                    onClick={() => void write(deployments.position, positionAbi, "advanceScripted", [])}
                  >
                    Advance scripted leg
                  </button>
                  <button
                    type="button"
                    disabled={!canReturn}
                    onClick={() => void write(deployments.position, positionAbi, "returnScripted", [])}
                  >
                    Return scripted slice
                  </button>
                </div>
              </div>
            )}

            <div className="owner-block">
              <p className="block-label">Scripted book</p>
              <div className="fields">
                <label>
                  Bid, USDC
                  <input inputMode="decimal" value={bid} onChange={(event) => setBid(event.target.value)} />
                </label>
                <label>
                  Ask, USDC
                  <input inputMode="decimal" value={ask} onChange={(event) => setAsk(event.target.value)} />
                </label>
                <label>
                  Slippage, bps
                  <input inputMode="numeric" value={slippage} onChange={(event) => setSlippage(event.target.value)} />
                </label>
              </div>
              <div className="row">
                <button
                  className="primary"
                  type="button"
                  disabled={!isOwner}
                  onClick={() =>
                    void write(deployments.scriptedBook, bookAbi, "set", [
                      parseUnits(bid, 18),
                      parseUnits(ask, 18),
                      BigInt(slippage || "0"),
                      1n,
                    ])
                  }
                >
                  Set scripted book
                </button>
              </div>
            </div>

            <div className="owner-block">
              <p className="block-label">Deposit</p>
              <div className="fields">
                <label>
                  Base, SDA
                  <input inputMode="decimal" value={baseIn} onChange={(event) => setBaseIn(event.target.value)} />
                </label>
                <label>
                  Quote, {deployments.quoteSymbol}
                  <input inputMode="decimal" value={quoteIn} onChange={(event) => setQuoteIn(event.target.value)} />
                </label>
              </div>
              <div className="row">
                <button className="primary" type="button" disabled={!isOwner} onClick={() => void approveAndDeposit()}>
                  Approve and deposit
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
      <p className={`status${status ? ` on ${statusTone(status)}` : ""}`} role="status">
        {status}
      </p>
    </div>
  );

  async function ensureAllowance(token: Address, amount: bigint) {
    if (!account) return false;
    const allowance = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, deployments.position],
    });
    if (allowance < amount) {
      return write(token, erc20Abi, "approve", [deployments.position, amount]);
    }
    return true;
  }

  async function approveAndDeposit() {
    const baseAmount = parseUnits(baseIn, 18);
    const quoteAmount = parseUnits(quoteIn, 6);
    if (baseAmount > 0n && !(await ensureAllowance(deployments.demoAsset, baseAmount))) return;
    if (quoteAmount > 0n && !(await ensureAllowance(deployments.quote, quoteAmount))) return;
    await write(deployments.position, positionAbi, "deposit", [baseAmount, quoteAmount]);
  }

  async function approveAndSwap() {
    const baseOut = parseUnits(swapSize, 18);
    const quoted = position?.quotedMidX18 ?? 0n;
    const usdcIn = (baseOut * quoted) / 10n ** 30n;
    if (!(await ensureAllowance(deployments.quote, usdcIn + 1n))) return;
    await write(deployments.position, positionAbi, "swap", [baseOut]);
  }
}
