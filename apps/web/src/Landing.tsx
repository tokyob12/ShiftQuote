import { useState } from "react";
import { Mark } from "./Logo";
import { decisions, PositionDiagram, type Decision } from "./PositionStates";
import { SiteHeader, SiteFooter, deskPath, matchPath } from "./site";
import "./landing.css";

export function Landing() {
  const [product, setProduct] = useState<"desk" | "match">("desk");
  const [decision, setDecision] = useState<Decision>("Stay");
  const [route, setRoute] = useState<"exit" | "deposit">("exit");
  return (
    <div className="site shift-home">
      <SiteHeader path="/" />
      <main>
        <section className="home-hero">
          <div className="home-intro">
            <p className="home-network">Shift on Elysium · Desk + Match</p>
            <h1>Keep the quote fresh.<br /><span>Connect the next move.</span></h1>
            <p className="home-lede">Desk follows the book to manage an LP’s quote. Match connects an Elysium USDC exit with an LP and someone bringing HYPE from HyperEVM.</p>
            <div className="home-actions">
              <a className="btn primary" href={deskPath}>Open Desk <span aria-hidden="true">↗</span></a>
              <a className="btn" href={matchPath}>Open Match <span aria-hidden="true">↗</span></a>
            </div>
            <p className="home-testnet">Explore both on testnet. Desk includes the submitted demo and a live-book WHYPE position. Match uses test mUSDC and HYPE.</p>
          </div>
          <div className="home-preview">
            <div className="home-preview-top"><Mark size={32} /><span>Explore Shift</span><span className="home-example">Interactive preview</span></div>
            <div className="home-route-switch" role="group" aria-label="Product preview">
              <button type="button" aria-pressed={product === "desk"} onClick={() => setProduct("desk")}>Desk · manage liquidity</button>
              <button type="button" aria-pressed={product === "match"} onClick={() => setProduct("match")}>Match · move funds</button>
            </div>
            {product === "desk" ? <div className="home-desk-preview">
              <div className="home-decision-switch" role="group" aria-label="Desk decisions">
                {decisions.map(({ name }) => <button key={name} type="button" className={name.toLowerCase()} aria-pressed={decision === name} onClick={() => setDecision(name)}>{name}</button>)}
              </div>
              <PositionDiagram state={decision} />
              <p className="home-preview-note">Illustrative states. The testnet Shift leg tracks a 25% slice in a scripted ledger; the tokens stay in the position contract.</p>
              <a className="btn primary" href={deskPath}>Try the submitted Desk</a>
            </div> : <div className="home-match-preview">
              <div className="home-route-switch" role="group" aria-label="Preview route">
                <button type="button" aria-pressed={route === "exit"} onClick={() => setRoute("exit")}>Exit Elysium</button>
                <button type="button" aria-pressed={route === "deposit"} onClick={() => setRoute("deposit")}>Enter Elysium</button>
              </div>
              <div className="home-amount"><span>You send · {route === "exit" ? "Elysium" : "HyperEVM"}</span><strong>{route === "exit" ? "4.00" : "0.0499"} <small>{route === "exit" ? "mUSDC" : "HYPE"}</small></strong></div>
              <div className="home-route-line"><span /><span aria-hidden="true">↓</span><span /></div>
              <div className="home-amount home-receive"><span>You receive · {route === "exit" ? "HyperEVM" : "Elysium"}</span><strong>{route === "exit" ? "0.0499" : "0.049975"} <small>HYPE</small></strong></div>
              <dl className="home-breakdown"><div><dt>Protocol fee</dt><dd>0.000025 HYPE</dd></div><div><dt>Community LP supplies</dt><dd>0.05 WHYPE</dd></div></dl>
              <p className="home-preview-note">Illustrative quote before gas. Your signed quote fixes amounts, fees and deadlines.</p>
              <a className="btn primary" href={route === "exit" ? matchPath : matchPath + "/deposit"}>{route === "exit" ? "Build an exit quote" : "Explore deposits"}</a>
            </div>}
          </div>
        </section>

        <section className="home-products" aria-labelledby="home-products-title">
          <div className="home-section-head"><p className="home-network">Two parts of Shift</p><h2 id="home-products-title">Manage the quote.<br />Give inventory a route.</h2></div>
          <div className="home-product-grid">
            <article className="home-product-card">
              <p className="home-product-label">01 / Desk <span>Submitted demo</span></p>
              <h3>Keep the LP from becoming the stale side.</h3>
              <p>Compare an Elysium position’s quote with its book. See when liquidity stays quoted, when it pulls, and how the owner tracks a Shift slice.</p>
              <ul><li><strong>Stay</strong> — update the quote inside the 50 bps band.</li><li><strong>Pull</strong> — stop quoting when the mid or slippage moves outside the band.</li><li><strong>Shift</strong> — track a 25% inventory slice through the scripted HyperCore leg.</li></ul>
              <p className="home-product-note">Try the submitted SDA/mUSDC demo or the WHYPE position marked against the live HyperCore HYPE/USDC book. The HyperCore inventory leg is scripted in both.</p>
              <div className="home-actions"><a className="btn primary" href={deskPath}>Open Desk ↗</a><a className="home-text-link" href="/docs/decisions">Read Desk decisions</a></div>
            </article>
            <article className="home-product-card">
              <p className="home-product-label">02 / Match <span>Testnet pilot</span></p>
              <h3>USDC on Elysium. HYPE on HyperEVM.</h3>
              <p>Combine a community LP’s conversion quote with an incoming depositor. Agree the full route before reserving your USDC.</p>
              <ul><li><strong>Exit user</strong> — pay Elysium mUSDC and receive HyperEVM HYPE.</li><li><strong>LP</strong> — supply WHYPE from an individual position and receive USDC.</li><li><strong>Depositor</strong> — pay HyperEVM HYPE and receive Elysium HYPE.</li></ul>
              <p className="home-product-note">Arrange participants for this testnet pilot. Signed amounts, separate inventory and two-chain deadlines define settlement and recovery.</p>
              <div className="home-actions"><a className="btn primary" href={matchPath}>Open Match ↗</a><a className="home-text-link" href="/docs/match">Read Match & recovery</a></div>
            </article>
          </div>
        </section>

        <section className="home-connection" aria-labelledby="home-connection-title">
          <div className="home-section-head"><p className="home-network">How they connect</p><h2 id="home-connection-title">From a local quote<br />to a complete exit.</h2><p>Desk demonstrates the quote and inventory foundation. Match extends that idea with a conversion and a participant moving the other way.</p></div>
          <ol className="home-connection-steps">
            <li><span>01</span><h3>Price the inventory</h3><p>Desk follows the book and shows Stay, Pull and Shift. Match uses an LP-approved quote for a specific WHYPE amount.</p></li>
            <li><span>02</span><h3>Reserve a conversion</h3><p>The exit user’s USDC and the Match LP’s WHYPE reserve together on Elysium, under the accepted terms.</p></li>
            <li><span>03</span><h3>Complete the route</h3><p>An incoming depositor funds HyperEVM HYPE. Settlement pays the exit user, credits Elysium HYPE to the depositor and USDC to the LP.</p></li>
          </ol>
          <p className="home-connection-note">Desk and Match currently use separate positions. To supply a Match, use its LP inventory page. The Desk’s scripted Shift action does not fund or settle a Match.</p>
          <div className="home-actions"><a className="home-text-link" href={deskPath}>Explore Desk →</a><a className="home-text-link" href={matchPath + "/lp"}>Supply Match inventory →</a></div>
        </section>

        <section className="home-liquidity">
          <div><p className="home-network">Community liquidity in Match</p><h2>Your inventory.<br />Your limits.</h2><p>Set how much WHYPE a fill can reserve. Withdraw your available inventory and USDC proceeds. Track reserved funds and claim native HYPE rewards from your position.</p><a className="btn" href={matchPath + "/lp"}>Open LP inventory ↗</a></div>
          <div className="home-principles"><div><strong>Separate positions</strong><p>Each LP controls their own inventory and quote signer.</p></div><div><strong>Fees from settled fills</strong><p>LP bonus comes from the protocol fee, within the campaign cap and deadline.</p></div><div><strong>A visible way back</strong><p>Check each chain’s state and claim or refund when its contract conditions allow.</p></div></div>
        </section>
        <section className="home-ready"><h2>Start with the Desk.<br />Explore the complete Match.</h2><div className="home-actions"><a className="btn primary" href={deskPath}>Open Desk</a><a className="btn" href={matchPath}>Open Match</a><a className="btn quiet" href="/docs">Read the docs ↗</a></div><p>Both products run on testnet. Match recovery follows each chain’s state and the signed deadlines.</p></section>
      </main>
      <SiteFooter />
    </div>
  );
}
