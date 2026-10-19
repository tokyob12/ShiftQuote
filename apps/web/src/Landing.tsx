import { Logo } from "./Logo";

const decisions = [
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

export function Landing() {
  return (
    <div className="app landing">
      <header>
        <a className="brand" href="/">
          <Logo />
        </a>
        <a className="desk-link" href="/app">
          Open the desk
        </a>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">One LP. One position.</p>
          <h1>Keep the Elysium quote from becoming the stale side.</h1>
          <div className="hero-foot">
            <p className="lede">
              When the Elysium quote falls behind the HyperCore book, the LP is the stale side. Shift reads the book and chooses.
            </p>
            <div className="hero-act">
              <ul className="words">
                <li>Stay</li>
                <li>Pull</li>
                <li>Shift</li>
              </ul>
              <a className="desk-link primary" href="/app">
                Open the desk
              </a>
            </div>
          </div>
        </section>
        <p className="section-label">Three decisions</p>
        <section className="decisions">
          {decisions.map((decision, index) => (
            <article key={decision.name} className={`decision ${decision.name}`}>
              <div className="decision-top">
                <h2>{decision.name}</h2>
                <span className="decision-index">0{index + 1}</span>
              </div>
              <div className="state" aria-hidden="true">
                <div className="state-track">
                  <span className="state-base" />
                  <span className="state-slice" />
                </div>
                <div className="state-ends">
                  <span>Elysium</span>
                  <span>HyperCore</span>
                </div>
              </div>
              <p>{decision.copy}</p>
            </article>
          ))}
        </section>
        <p className="banner">
          <span className="banner-tag">Testnet</span>
          <span>The HyperCore leg is scripted on testnet. Tokens stay in the contract. This is not an order on HyperCore.</span>
        </p>
        <div className="closing">
          <a className="brand" href="/" aria-label="Shift">
            <Logo />
          </a>
          <a className="desk-link primary close" href="/app">
            Open the desk
          </a>
        </div>
      </main>
    </div>
  );
}
