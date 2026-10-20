export const decisions = [
  {
    name: "Stay",
    copy: "Moves the quote to the new mid when the book is inside the 50 bps band.",
  },
  {
    name: "Pull",
    copy: "Removes the quote when the mid or the slippage leaves the band. Tokens stay on Elysium.",
  },
  {
    name: "Shift",
    copy: "Moves at most 25% of base into the scripted ledger, toward that LP's own HyperCore book.",
  },
] as const;

export type Decision = (typeof decisions)[number]["name"];

export const decisionOrder: Decision[] = ["Stay", "Pull", "Shift"];

/** Elysium on the left, the scripted HyperCore ledger on the right. Solid fill is the live quote. */
function Lane({ core }: { core?: string }) {
  return (
    <div className="lane" aria-hidden="true">
      <div className="lane-side elysium">
        <span className="lane-fill" />
      </div>
      <div className="lane-path">
        <span className="lane-flow" />
      </div>
      <div className="lane-side core">{core && <span className="lane-core">{core}</span>}</div>
      <span className="lane-slice" />
    </div>
  );
}

type DiagramProps = {
  state: Decision | "Idle";
  timer?: { key: string; ms: number } | null;
};

export function PositionDiagram({ state, timer }: DiagramProps) {
  const current = state === "Idle" ? null : decisions.find((decision) => decision.name === state);
  return (
    <figure className={`diagram is-${state.toLowerCase()}`}>
      <div className="diagram-venues" aria-hidden="true">
        <span>Elysium</span>
        <span>HyperCore</span>
      </div>
      <Lane core="Scripted ledger" />
      <div className="band" aria-hidden="true">
        <span className="band-axis" />
        <span className="band-zone" />
        <span className="band-label">50 bps band</span>
        <span className="band-rail quote">
          <span className="band-mark">
            <em>Quote</em>
          </span>
        </span>
        <span className="band-rail book">
          <span className="band-mark">
            <em>Book mid</em>
          </span>
        </span>
      </div>
      <figcaption aria-live="polite">
        {current ? (
          <>
            <strong key={current.name} className={`caption-name ${current.name}`}>
              {current.name}
            </strong>
            <span key={`${current.name}-copy`} className="caption-copy">
              {current.copy}
            </span>
          </>
        ) : (
          <span className="caption-copy">Stay and Pull follow the book. Shift is the owner's move.</span>
        )}
      </figcaption>
      {timer && <span key={timer.key} className="diagram-timer" style={{ animationDuration: `${timer.ms}ms` }} />}
    </figure>
  );
}

export function StateTrack({ state, play }: { state: Decision; play: boolean }) {
  return (
    <div className={`track is-${state.toLowerCase()}${play ? " play" : ""}`}>
      <Lane />
      <div className="track-ends" aria-hidden="true">
        <span>Elysium</span>
        <span>HyperCore</span>
      </div>
    </div>
  );
}
