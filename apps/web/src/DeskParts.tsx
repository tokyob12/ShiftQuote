import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Shows a value and flashes it when it changes, up in green and down in amber. */
export function Ticker({ value, className }: { value: string; className?: string }) {
  const previous = useRef(value);
  const [change, setChange] = useState<{ count: number; direction: "up" | "down" | "same" }>({ count: 0, direction: "same" });

  useEffect(() => {
    if (previous.current === value) return;
    const before = Number.parseFloat(previous.current);
    const after = Number.parseFloat(value);
    previous.current = value;
    const direction = Number.isNaN(before) || Number.isNaN(after) || before === after ? "same" : after > before ? "up" : "down";
    setChange((current) => ({ count: current.count + 1, direction }));
  }, [value]);

  const flash = change.count > 0 ? ` tick-${change.direction}` : "";
  return (
    <span key={change.count} className={`ticker${flash}${className ? ` ${className}` : ""}`}>
      {value}
    </span>
  );
}

const routeSteps = [
  { label: "Elysium", locations: [1, 2] },
  { label: "In transit", locations: [3] },
  { label: "Core idle", locations: [4] },
  { label: "Resting", locations: [5] },
] as const;

/** Where the base sits along the scripted path from Elysium toward HyperCore. */
export function Route({ location }: { location: number }) {
  const index = routeSteps.findIndex((step) => (step.locations as readonly number[]).includes(location));
  const progress = index <= 0 ? 0 : index / (routeSteps.length - 1);
  const tone = location === 2 ? "pulled" : index > 0 ? "scripted" : index === 0 ? "quoted" : "idle";
  return (
    <ol className={`route ${tone}`} style={{ "--progress": progress } as CSSProperties} aria-label="Scripted route">
      <span className="route-line" aria-hidden="true">
        <span className="route-fill" />
        {index > 0 && <span className="route-pulse" />}
      </span>
      {routeSteps.map((step, stepIndex) => (
        <li
          key={step.label}
          className={stepIndex === index ? "now" : stepIndex < index ? "past" : undefined}
          aria-current={stepIndex === index ? "step" : undefined}
        >
          <span className="route-dot" aria-hidden="true" />
          <span className="route-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

type Level = { px: string; sz: string };

function decimalsOf(value: string): number {
  return value.includes(".") ? value.split(".")[1].length : 0;
}

export function Ladder({ asks, bids }: { asks: Level[]; bids: Level[] }) {
  const sizes = [...asks, ...bids].map((level) => Number(level.sz)).filter((size) => Number.isFinite(size));
  const max = Math.max(1e-9, ...sizes);
  const bestAsk = asks[0];
  const bestBid = bids[0];
  let spreadText = "";
  if (bestAsk && bestBid) {
    const ask = Number(bestAsk.px);
    const bid = Number(bestBid.px);
    const width = ask - bid;
    const bps = ((width / ((ask + bid) / 2)) * 10_000).toFixed(2);
    spreadText = `${width.toFixed(Math.max(decimalsOf(bestAsk.px), decimalsOf(bestBid.px)))} · ${bps} bps`;
  }

  const row = (level: Level, side: "ask" | "bid", index: number) => (
    <div
      key={`${side}-${level.px}`}
      className={`level ${side}`}
      style={{ "--depth": Math.min(1, Number(level.sz) / max), "--i": index } as CSSProperties}
    >
      <span className="level-depth" aria-hidden="true" />
      <span className="level-px">{level.px}</span>
      <Ticker className="level-sz" value={level.sz} />
    </div>
  );

  return (
    <div className="ladder" aria-label="ETH order book">
      <div className="ladder-head" aria-hidden="true">
        <span>Price</span>
        <span>Size</span>
      </div>
      <div className="ladder-side asks">{[...asks].reverse().map((level, index) => row(level, "ask", index))}</div>
      <div className="spread">
        <span className="spread-px">
          {bestBid?.px ?? "—"} <span className="spread-sep">·</span> {bestAsk?.px ?? "—"}
        </span>
        {spreadText && <span className="spread-width">Spread {spreadText}</span>}
      </div>
      <div className="ladder-side bids">{bids.map((level, index) => row(level, "bid", index))}</div>
    </div>
  );
}

export function statusTone(status: string): "busy" | "ok" | "note" {
  if (/^(Sending|Waiting)/.test(status)) return "busy";
  if (status.endsWith("confirmed.")) return "ok";
  return "note";
}
