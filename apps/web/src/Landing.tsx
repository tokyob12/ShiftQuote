import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { Mark } from "./Logo";
import { decisionOrder, decisions, PositionDiagram, StateTrack, type Decision } from "./PositionStates";
import { useInView, usePath, useReducedMotion } from "./router";
import { deskPath, SiteFooter, SiteHeader, TestnetNote } from "./site";

const headline = "Keep the Elysium quote from becoming the stale side.";
const CYCLE_MS = 4200;
const step = (index: number) => ({ "--i": index }) as CSSProperties;
const INTRO_MS = 1100;

export function Landing() {
  const path = usePath();
  const reduced = useReducedMotion();
  const [started, setStarted] = useState(false);
  const [state, setState] = useState<Decision>("Stay");
  const [auto, setAuto] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), reduced ? 0 : INTRO_MS);
    return () => clearTimeout(timer);
  }, [reduced]);

  const cycling = started && auto && !reduced;

  useEffect(() => {
    if (!cycling || paused) return;
    const timer = setTimeout(() => {
      setState((current) => decisionOrder[(decisionOrder.indexOf(current) + 1) % decisionOrder.length]);
    }, CYCLE_MS);
    return () => clearTimeout(timer);
  }, [cycling, paused, state]);

  const shown: Decision = reduced && auto ? "Shift" : state;

  function choose(name: Decision) {
    setAuto(false);
    setState(name);
  }

  return (
    <div className="site landing">
      <SiteHeader path={path} />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <Mark size={52} className="hero-mark" />
            <p className="eyebrow seq" style={step(1)}>
              One LP. One position.
            </p>
            <h1 className="hero-title">
              {headline.split(" ").map((word, index) => (
                <Fragment key={index}>
                  <span className="word" style={step(index + 2)}>
                    {word}
                  </span>{" "}
                </Fragment>
              ))}
            </h1>
            <p className="lede seq" style={step(11)}>
              When the Elysium quote falls behind the HyperCore book, the LP is the stale side. Stay and Pull follow the book. Shift is the owner's move.
            </p>
            <div className="state-tabs seq" style={step(12)} role="group" aria-label="Decisions">
              {decisionOrder.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`state-tab ${name}`}
                  aria-pressed={started && shown === name}
                  onClick={() => choose(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="hero-actions seq" style={step(13)}>
              <a className="btn primary" href={deskPath}>
                Open the desk
              </a>
              <a className="btn quiet" href="/docs">
                Read the docs
              </a>
            </div>
          </div>
          <div
            className="hero-figure seq"
            style={step(9)}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <PositionDiagram
              state={started ? shown : "Idle"}
              timer={cycling && !paused ? { key: `${state}`, ms: CYCLE_MS } : null}
            />
          </div>
        </section>

        <section className="decisions-section" aria-labelledby="decisions-title">
          <p className="section-label" id="decisions-title">
            Three decisions
          </p>
          <div className="decisions">
            {decisions.map((decision, index) => (
              <DecisionCard key={decision.name} name={decision.name} copy={decision.copy} index={index} />
            ))}
          </div>
          <TestnetNote />
        </section>

        <section className="closing">
          <a className="btn primary" href={deskPath}>
            Open the desk
          </a>
          <a className="btn quiet" href="/docs">
            Read the docs
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function DecisionCard({ name, copy, index }: { name: Decision; copy: string; index: number }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref);
  const [replay, setReplay] = useState(0);
  return (
    <article
      ref={ref}
      className={`decision ${name}${seen ? " in" : ""}`}
      style={step(index)}
      onMouseEnter={() => seen && setReplay((count) => count + 1)}
    >
      <div className="decision-top">
        <h2>{name}</h2>
        <span className="decision-index">0{index + 1}</span>
      </div>
      <StateTrack key={replay} state={name} play={seen} />
      <p>{copy}</p>
    </article>
  );
}
