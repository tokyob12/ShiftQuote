import { useCallback, useEffect, useRef, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, parseAbiItem, verifyTypedData, type Address, type Hex, type WalletClient } from "viem";
import { erc20Abi, positionV2Abi } from "./abi";
import { elysiumTestnet, rpcUrl } from "./chain";
import { deployments } from "./deployments";
import { Ladder, Route, Ticker } from "./DeskParts";
import { decodeDeskQuote, signedDeskAbi, signedDeskAddress, signedDeskTypes } from "./signedDesk";

const LOCATIONS = ["Uninitialized", "Quoted", "Pulled", "InTransit", "OnCoreIdle", "Resting"] as const;
const DECISIONS = ["None", "Stay", "Pull", "Shift"] as const;

type Level = { px: string; sz: string };

type LiveView = {
  owner: Address;
  location: number;
  lastDecision: number;
  quotedMidX18: bigint;
  spotLinked: boolean;
  swapsOpen: boolean;
  elysiumBase: bigint;
  elysiumQuote: bigint;
  transitBase: bigint;
  coreIdleBase: bigint;
  restingBase: bigint;
  preview: string;
  previewDecision: number | null;
  bookAge: string;
  bookStale: boolean;
  freshMid: bigint | null;
};

const publicClient = createPublicClient({
  chain: elysiumTestnet,
  transport: http(rpcUrl),
});

const deskDeployBlock = 25_552_255n;
const quoteLogChunk = 50_000n;
const quoteEvents = [
  parseAbiItem("event Evaluated(uint8 decision, uint256 midX18)"),
  parseAbiItem("event Requoted(uint256 previousMidX18, uint256 midX18)"),
] as const;

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

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

export function LivePosition({
  account,
  onStatus,
}: {
  account: Address | null;
  onStatus: (status: string) => void;
}) {
  const [view, setView] = useState<LiveView | null>(null);
  const [error, setError] = useState("");
  const [levels, setLevels] = useState<{ bids: Level[]; asks: Level[] } | null>(null);
  const [bookTime, setBookTime] = useState<number | null>(null);
  const [quoteSetAt, setQuoteSetAt] = useState<number | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const quoteFloor = useRef(deskDeployBlock);
  const quoteScanBusy = useRef(false);
  const [bookError, setBookError] = useState("");
  const [parkedBase, setParkedBase] = useState<bigint | null>(null);
  const [swapSize, setSwapSize] = useState("0.01");
  const [withdrawBase, setWithdrawBase] = useState("0.1");
  const [withdrawQuote, setWithdrawQuote] = useState("0");

  const refresh = useCallback(async () => {
    try {
      const calls = [
        "owner",
        "location",
        "lastDecision",
        "quotedMidX18",
        "spotLinked",
        "swapsOpen",
        "elysiumBase",
        "elysiumQuote",
        "transitBase",
        "coreIdleBase",
        "restingBase",
      ] as const;
      const results = await publicClient.multicall({
        contracts: calls.map((functionName) => ({
          address: signedDeskAddress,
          abi: positionV2Abi,
          functionName,
        })),
      });
      const value = <T,>(index: number): T => {
        const item = results[index];
        if (item.status !== "success") throw new Error(`${calls[index]} failed`);
        return item.result as T;
      };
      const location = Number(value<number>(1));
      const parked = await publicClient.readContract({
        address: deployments.v2.position,
        abi: positionV2Abi,
        functionName: "elysiumBase",
      });
      setParkedBase(parked);
      setView({
        owner: value(0),
        location,
        lastDecision: Number(value<number>(2)),
        quotedMidX18: value(3),
        spotLinked: value(4),
        swapsOpen: value(5),
        elysiumBase: value(6),
        elysiumQuote: value(7),
        transitBase: value(8),
        coreIdleBase: value(9),
        restingBase: value(10),
        preview: "",
        previewDecision: null,
        bookAge: "—",
        bookStale: false,
        freshMid: null,
      });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read the live position");
    }
  }, []);

  const loadBook = useCallback(async () => {
    try {
      const response = await fetch("/hl/info", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "l2Book", coin: deployments.v2.spotCoin }),
      });
      if (!response.ok) throw new Error(`Book request failed (${response.status})`);
      const body = (await response.json()) as { time?: number; levels: [Level[], Level[]] };
      setLevels({ bids: body.levels[0].slice(0, 5), asks: body.levels[1].slice(0, 5) });
      setBookTime(typeof body.time === "number" ? body.time : Date.now());
      setBookError("");
    } catch (caught) {
      setBookError(caught instanceof Error ? caught.message : "Could not read the HYPE book");
    }
  }, []);

  const loadQuoteTime = useCallback(async () => {
    if (quoteScanBusy.current) return;
    quoteScanBusy.current = true;
    try {
      const head = await publicClient.getBlockNumber();
      let cursor = head;
      let found: bigint | null = null;
      const floor = quoteFloor.current;
      while (cursor >= floor) {
        const start = cursor - floor > quoteLogChunk ? cursor - quoteLogChunk : floor;
        const logs = await publicClient.getLogs({
          address: signedDeskAddress,
          events: quoteEvents,
          fromBlock: start,
          toBlock: cursor,
        });
        if (logs.length > 0) {
          found = logs[logs.length - 1].blockNumber ?? null;
          break;
        }
        if (start === floor) break;
        cursor = start - 1n;
      }
      if (found === null) {
        quoteFloor.current = head > 1n ? head - 1n : head;
        return;
      }
      const block = await publicClient.getBlock({ blockNumber: found });
      quoteFloor.current = found;
      setQuoteSetAt(Number(block.timestamp));
    } catch {
      // Keep the last known quote time. The next refresh tries again.
    } finally {
      quoteScanBusy.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadBook();
    void loadQuoteTime();
    const timer = setInterval(() => {
      void refresh();
      void loadBook();
      void loadQuoteTime();
    }, 4000);
    return () => clearInterval(timer);
  }, [refresh, loadBook, loadQuoteTime]);

  useEffect(() => {
    const timer = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function write(functionName: string, args: readonly unknown[], address: Address = signedDeskAddress, abi: readonly unknown[] = positionV2Abi) {
    if (!account || !window.ethereum) {
      onStatus("Connect a wallet first.");
      return false;
    }
    const wallet: WalletClient = createWalletClient({
      account,
      chain: elysiumTestnet,
      transport: custom(window.ethereum),
    });
    onStatus(`Sending ${functionName}…`);
    try {
      const hash = await wallet.writeContract({
        address,
        abi,
        functionName,
        args,
        account,
        chain: elysiumTestnet,
      } as never);
      onStatus(`Waiting for ${functionName}…`);
      await publicClient.waitForTransactionReceipt({ hash });
      onStatus(`${functionName} confirmed.`);
      await refresh();
      await loadQuoteTime();
      return true;
    } catch (caught) {
      onStatus(caught instanceof Error ? caught.message : `${functionName} failed`);
      return false;
    }
  }

  const isOwner = account !== null && view !== null && account.toLowerCase() === view.owner.toLowerCase();
  const locationName = view ? LOCATIONS[view.location] : "—";
  const ladderAgeSeconds = bookTime === null ? null : Math.max(0, nowSeconds - Math.floor(bookTime / 1000));
  const bookStale = ladderAgeSeconds === null || ladderAgeSeconds > 15;
  const quoteAgeSeconds = quoteSetAt === null ? null : Math.max(0, nowSeconds - quoteSetAt);
  const topMid = levels?.bids[0] && levels.asks[0] ? (parseUnits(levels.bids[0].px, 18) + parseUnits(levels.asks[0].px, 18)) / 2n : null;
  const deviation = view && topMid && view.quotedMidX18 > 0n ? ((topMid > view.quotedMidX18 ? topMid - view.quotedMidX18 : view.quotedMidX18 - topMid) * 10000n) / view.quotedMidX18 : null;
  const previewDecision = deviation === null ? null : deviation > 50n ? 2 : 1;
  const preview = bookStale
    ? "The live book is older than 15 seconds, so the quote is paused."
    : previewDecision === 2
      ? `Pull at ${formatUnits(topMid ?? 0n, 18)} USDC. The move is outside 50 bps.`
      : `Stay at ${formatUnits(topMid ?? 0n, 18)} USDC, inside 50 bps.`;
  const canEvaluate = (view?.location === 1 || view?.location === 2) && !bookStale;
  const wantBase = (() => {
    try {
      return parseUnits(swapSize, 18);
    } catch {
      return 0n;
    }
  })();
  const soldOut = view !== null && view.elysiumBase === 0n;
  const overSize = view !== null && !soldOut && wantBase > view.elysiumBase;
  const tone = view?.location === 1 ? "quoted" : view?.location === 2 ? "pulled" : view && view.location >= 3 ? "scripted" : "idle";

  async function deskQuote(action: number, size: bigint) {
    if (!account) throw new Error("Connect a wallet first.");
    const response = await fetch("/route-api/desk-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caller: account, action, size: size.toString() }),
    });
    const body = (await response.json()) as { error?: string; quote?: Record<string, string>; signature?: Hex };
    if (!response.ok || !body.quote || !body.signature) throw new Error(body.error ?? "Quote service unavailable");
    const quote = decodeDeskQuote(body.quote);
    const signer = await publicClient.readContract({ address: signedDeskAddress, abi: signedDeskAbi, functionName: "quoteSigner" });
    const valid = await verifyTypedData({
      address: signer,
      domain: { name: "Shift Signed Desk", version: "1", chainId: elysiumTestnet.id, verifyingContract: signedDeskAddress },
      types: signedDeskTypes,
      primaryType: "Quote",
      message: quote,
      signature: body.signature,
    });
    if (!valid || quote.caller.toLowerCase() !== account.toLowerCase() || quote.action !== action) throw new Error("Invalid signed quote");
    return { quote, signature: body.signature };
  }

  async function signedCall(functionName: "evaluateSigned" | "requoteSigned" | "shiftSigned", action: number, size: bigint) {
    onStatus("Requesting a signed quote…");
    try {
      const { quote, signature } = await deskQuote(action, size);
      await write(functionName, [quote, signature], signedDeskAddress, signedDeskAbi);
    } catch (caught) {
      onStatus(caught instanceof Error ? caught.message : "Signed quote failed");
    }
  }

  async function approveAndSwap() {
    if (!view || !account) return;
    const baseOut = parseUnits(swapSize, 18);
    const usdcIn = (baseOut * view.quotedMidX18) / 10n ** 30n;
    const maxUsdcIn = (usdcIn * 10050n) / 10000n + 1n;
    onStatus("Requesting a signed quote…");
    try {
      const { quote, signature } = await deskQuote(1, baseOut);
      const allowance = await publicClient.readContract({
        address: deployments.quote,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, signedDeskAddress],
      });
      if (allowance < maxUsdcIn && !(await write("approve", [signedDeskAddress, maxUsdcIn], deployments.quote, erc20Abi))) return;
      await write("swapSigned", [baseOut, maxUsdcIn, quote, signature], signedDeskAddress, signedDeskAbi);
    } catch (caught) {
      onStatus(caught instanceof Error ? caught.message : "Signed quote failed");
    }
  }

  return (
    <div className="live-layout">
      <section className={`card tone-${tone}`}>
        <div className="card-head">
          <h2>Live position</h2>
          {view && <p className={`location ${locationName}`}>{locationName}</p>}
        </div>
        {view ? (
          <>
            <Route location={view.location} />
            <div className="metrics">
              <div className="metric">
                <span className="metric-label">Elysium base</span>
                <strong>
                  <Ticker value={formatUnits(view.elysiumBase, 18)} /> <span className="unit">{deployments.v2.baseSymbol}</span>
                </strong>
              </div>
              <div className="metric">
                <span className="metric-label">Elysium quote</span>
                <strong>
                  <Ticker value={formatUnits(view.elysiumQuote, 6)} /> <span className="unit">{deployments.quoteSymbol} (mock)</span>
                </strong>
              </div>
              <div className="metric">
                <span className="metric-label">In transit</span>
                <strong>
                  <Ticker value={formatUnits(view.transitBase, 18)} /> <span className="unit">{deployments.v2.baseSymbol}</span>
                </strong>
              </div>
            </div>
            <dl className="facts">
              <div>
                <dt>Last decision</dt>
                <dd className={`decision-word ${DECISIONS[view.lastDecision]}`}>{DECISIONS[view.lastDecision]}</dd>
              </div>
              <div>
                <dt>Quoted mid</dt>
                <dd>
                  <Ticker value={formatUnits(view.quotedMidX18, 18)} /> USDC
                </dd>
              </div>
              <div>
                <dt>Book age</dt>
                <dd>{quoteAgeSeconds === null ? "—" : formatAge(quoteAgeSeconds)}</dd>
              </div>
              <div>
                <dt>Swaps</dt>
                <dd>{!view.swapsOpen ? "Closed" : soldOut ? "Sold out" : "Open"}</dd>
              </div>
            </dl>
            <p className="hint">WHYPE marked against the live HYPE book with a signed quote. The slice stays in this contract. This is not an order on HyperCore.</p>
            {parkedBase !== null && parkedBase > 0n && (
              <p className="hint">The previous position still holds {formatUnits(parkedBase, 18)} WHYPE and its swaps stay closed.</p>
            )}
          </>
        ) : (
          <p className="hint loading">{error || "Reading the live position…"}</p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Buy WHYPE</h2>
        </div>
        {view ? (
          <>
            <div className="next">
              <span className="next-label">Next decision</span>
              <span key={preview} className="next-value">
                {preview}
              </span>
            </div>
            <div className="trade-bar">
              <button className="primary evaluate" type="button" disabled={!account || !canEvaluate} onClick={() => void signedCall("evaluateSigned", 3, view.elysiumBase)}>
                Evaluate
              </button>
              <label className="trade-size">
                <span className="trade-label">Buy</span>
                <span className="trade-input">
                  <input inputMode="decimal" value={swapSize} onChange={(event) => setSwapSize(event.target.value)} />
                  <span className="trade-unit">{deployments.v2.baseSymbol}</span>
                </span>
              </label>
              <button
                className="primary swap"
                type="button"
                disabled={
                  !account ||
                  !view.swapsOpen ||
                  bookStale ||
                  view.location !== 1 ||
                  previewDecision === 2 ||
                  soldOut ||
                  overSize ||
                  wantBase === 0n
                }
                onClick={() => void approveAndSwap()}
              >
                Swap
              </button>
            </div>
            <p className="hint">
              {!view.swapsOpen
                ? "Swaps are closed."
                : bookStale
                  ? "The live book is older than 15 seconds, so Evaluate and Swap wait."
                : soldOut
                  ? `Sold out. The position has no ${deployments.v2.baseSymbol} left to sell. The LP can deposit more.`
                  : overSize
                    ? `Only ${formatUnits(view.elysiumBase, 18)} ${deployments.v2.baseSymbol} is left. Lower the amount to buy.`
                    : "Swap uses a fresh signed quote. Inside 50 bps it sells at the stored mid. Outside the band it reverts. Payment is mUSDC."}
            </p>
            {isOwner && (
              <div className="owner-block">
                <p className="block-label">LP wallet</p>
                <div className="row secondary">
                  <button type="button" onClick={() => void write("setSwapsOpen", [!view.swapsOpen])}>
                    {view.swapsOpen ? "Close swaps" : "Open swaps"}
                  </button>
                  <button type="button" disabled={!canEvaluate} onClick={() => void write("setSpotLinked", [!view.spotLinked])}>
                    {view.spotLinked ? "Unlink spot" : "Link spot"}
                  </button>
                  <button type="button" disabled={!view.spotLinked || !canEvaluate} onClick={() => void signedCall("shiftSigned", 5, view.elysiumBase)}>
                    Shift 25%
                  </button>
                  <button type="button" disabled={view.location !== 3 && view.location !== 4} onClick={() => void write("advanceScripted", [])}>
                    Advance
                  </button>
                  <button
                    type="button"
                    disabled={view.transitBase + view.coreIdleBase + view.restingBase === 0n}
                    onClick={() => void write("returnScripted", [])}
                  >
                    Return
                  </button>
                  {deployments.v2.hasRequote && (
                    <button type="button" disabled={view.location !== 2 || bookStale} onClick={() => void signedCall("requoteSigned", 4, view.elysiumBase)}>
                      Requote at book
                    </button>
                  )}
                </div>
                <div className="fields">
                  <label>
                    Withdraw WHYPE
                    <input inputMode="decimal" value={withdrawBase} onChange={(event) => setWithdrawBase(event.target.value)} />
                  </label>
                  <label>
                    Withdraw mUSDC
                    <input inputMode="decimal" value={withdrawQuote} onChange={(event) => setWithdrawQuote(event.target.value)} />
                  </label>
                </div>
                <div className="row">
                  <button
                    type="button"
                    disabled={view.location !== 1 && view.location !== 2}
                    onClick={() => void write("withdraw", [parseUnits(withdrawBase, 18), parseUnits(withdrawQuote, 6)])}
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="hint loading">{error || "Reading the live position…"}</p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>HYPE book</h2>
          <span className={`live${bookError ? " off" : levels ? " on" : ""}`}>{bookError ? "Offline" : "Live"}</span>
        </div>
        <p className="hint">HyperCore HYPE/USDC, coin @107. Evaluate and Swap sign a quote from this book.</p>
        {bookError && <p className="hint">{bookError}</p>}
        {levels && <Ladder asks={levels.asks} bids={levels.bids} />}
      </section>
    </div>
  );
}
