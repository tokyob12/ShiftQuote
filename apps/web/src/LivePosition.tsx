import { useCallback, useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, type Address, type WalletClient } from "viem";
import { bookAbi, erc20Abi, positionV2Abi } from "./abi";
import { elysiumTestnet, rpcUrl } from "./chain";
import { deployments } from "./deployments";
import { Ladder, Route, Ticker } from "./DeskParts";

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

function formatUnits(value: bigint, decimals: number, digits = 4): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, "0").slice(0, digits);
  return `${whole.toString()}.${frac}`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
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
  const [bookError, setBookError] = useState("");
  const [swapSize, setSwapSize] = useState("0.01");
  const [withdrawBase, setWithdrawBase] = useState("0.1");
  const [withdrawQuote, setWithdrawQuote] = useState("0");

  const refresh = useCallback(async () => {
    try {
      const block = await publicClient.getBlock();
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
          address: deployments.v2.position,
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
      let preview = "No live decision.";
      let bookAge = "—";
      let bookStale = false;
      let freshMid: bigint | null = null;
      let previewDecision: number | null = null;
      if (location === 1 || location === 2) {
        try {
          const previewResult = await publicClient.readContract({
            address: deployments.v2.position,
            abi: positionV2Abi,
            functionName: "preview",
          });
          const [decision, mid, slippageBps, timestamp] = previewResult;
          const age = Math.max(0, Number(block.timestamp) - Number(timestamp));
          previewDecision = Number(decision);
          preview = `${DECISIONS[previewDecision]} at ${formatUnits(mid, 18)} USDC, slippage ${slippageBps.toString()} bps`;
          bookAge = `${age}s`;
          freshMid = mid;
        } catch (caught) {
          const postedAt = await publicClient.readContract({
            address: deployments.v2.keeperBook,
            abi: bookAbi,
            functionName: "postedAt",
          });
          const age = Math.max(0, Number(block.timestamp) - Number(postedAt));
          const stale = postedAt === 0n || age > 15 || `${caught instanceof Error ? caught.message : caught}`.includes("0xd7815800");
          if (stale) {
            bookStale = true;
            bookAge = postedAt === 0n ? "never" : formatAge(age);
            preview = `The keeper is not posting, so the book is stale and swaps are paused. Last post: ${bookAge}.`;
          } else {
            preview = "Book read failed";
          }
        }
      }
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
        preview,
        previewDecision,
        bookAge,
        bookStale,
        freshMid,
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
      const body = (await response.json()) as { levels: [Level[], Level[]] };
      setLevels({ bids: body.levels[0].slice(0, 5), asks: body.levels[1].slice(0, 5) });
      setBookError("");
    } catch (caught) {
      setBookError(caught instanceof Error ? caught.message : "Could not read the HYPE book");
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

  async function write(functionName: string, args: readonly unknown[], address: Address = deployments.v2.position, abi: typeof positionV2Abi | typeof erc20Abi = positionV2Abi) {
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
      return true;
    } catch (caught) {
      onStatus(caught instanceof Error ? caught.message : `${functionName} failed`);
      return false;
    }
  }

  const isOwner = account !== null && view !== null && account.toLowerCase() === view.owner.toLowerCase();
  const locationName = view ? LOCATIONS[view.location] : "—";
  const canEvaluate = (view?.location === 1 || view?.location === 2) && !view.bookStale;
  const tone = view?.location === 1 ? "quoted" : view?.location === 2 ? "pulled" : view && view.location >= 3 ? "scripted" : "idle";

  async function approveAndSwap() {
    if (!view) return;
    const baseOut = parseUnits(swapSize, 18);
    const mid = view.freshMid ?? view.quotedMidX18;
    const usdcIn = (baseOut * mid) / 10n ** 30n;
    const maxUsdcIn = (usdcIn * 10050n) / 10000n + 1n;
    const allowance = account
      ? await publicClient.readContract({
          address: deployments.quote,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account, deployments.v2.position],
        })
      : 0n;
    if (allowance < maxUsdcIn && !(await write("approve", [deployments.v2.position, maxUsdcIn], deployments.quote, erc20Abi))) return;
    await write("swap", [baseOut, maxUsdcIn]);
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
                <dd>{view.bookAge}</dd>
              </div>
              <div>
                <dt>Swaps</dt>
                <dd>{view.swapsOpen ? "Open" : "Closed"}</dd>
              </div>
            </dl>
            <p className="hint">WHYPE marked against the HyperCore HYPE/USDC book. The slice stays in this contract. This is not an order on HyperCore.</p>
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
              <span key={view.preview} className="next-value">
                {view.preview}
              </span>
            </div>
            <div className="trade-bar">
              <button className="primary evaluate" type="button" disabled={!account || !canEvaluate} onClick={() => void write("evaluate", [])}>
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
                disabled={!account || !view.swapsOpen || view.bookStale || view.location !== 1 || view.previewDecision === 2}
                onClick={() => void approveAndSwap()}
              >
                Swap
              </button>
            </div>
            <p className="hint">
              {view.swapsOpen
                ? "Swap reads the book in the same transaction. Inside 50 bps it sells at the fresh mid. Outside the band it reverts. Payment is mUSDC."
                : "Swaps are closed. Evaluate still reads the book."}
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
                  <button type="button" disabled={!view.spotLinked || !canEvaluate} onClick={() => void write("shift", [])}>
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
                    <button type="button" disabled={view.location !== 2} onClick={() => void write("requote", [])}>
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
        <p className="hint">HyperCore HYPE/USDC, coin @107. The trade uses the keeper snapshot, not this ladder.</p>
        {bookError && <p className="hint">{bookError}</p>}
        {levels && <Ladder asks={levels.asks} bids={levels.bids} />}
      </section>
    </div>
  );
}
