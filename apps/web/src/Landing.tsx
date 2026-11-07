import {useState} from "react";
import {Mark} from "./Logo";
import {SiteHeader,SiteFooter,deskPath,matchPath} from "./site";
import "./landing.css";

export function Landing(){
 const [route,setRoute]=useState<"exit"|"deposit">("exit");
 return <div className="site shift-home">
  <SiteHeader path="/"/>
  <main>
   <section className="home-hero">
    <div className="home-intro">
     <p className="home-network">Elysium / HyperEVM</p>
     <h1>USDC on Elysium.<br/><span>HYPE on HyperEVM.</span></h1>
     <p className="home-lede">Turn Elysium USDC into HyperEVM HYPE through a community LP and someone moving the other way.</p>
     <div className="home-actions">
      <a className="btn primary" href={matchPath}>Try testnet Match <span aria-hidden="true">↗</span></a>
      <a className="btn quiet" href={matchPath+"/lp"}>Provide liquidity</a>
     </div>
     <p className="home-testnet">Testnet is open. Quotes use mUSDC and test HYPE.</p>
    </div>
    <div className="home-preview">
     <div className="home-preview-top"><Mark size={32}/><span>Match preview</span><span className="home-example">Illustrative quote</span></div>
     <div className="home-route-switch" aria-label="Preview route">
      <button type="button" aria-pressed={route==="exit"} onClick={()=>setRoute("exit")}>Exit Elysium</button>
      <button type="button" aria-pressed={route==="deposit"} onClick={()=>setRoute("deposit")}>Enter Elysium</button>
     </div>
     <div className="home-amount"><span>You send · {route==="exit"?"Elysium":"HyperEVM"}</span><strong>{route==="exit"?"4.00":"0.0499"} <small>{route==="exit"?"mUSDC":"HYPE"}</small></strong></div>
     <div className="home-route-line"><span/ ><span aria-hidden="true">↓</span><span/></div>
     <div className="home-amount home-receive"><span>You receive · {route==="exit"?"HyperEVM":"Elysium"}</span><strong>{route==="exit"?"0.0499":"0.049975"} <small>HYPE</small></strong></div>
     <dl className="home-breakdown"><div><dt>Protocol fee</dt><dd>0.000025 HYPE</dd></div><div><dt>Community LP supplies</dt><dd>0.05 WHYPE</dd></div></dl>
     <p className="home-preview-note">Example before gas. Your signed quote fixes amounts, fees and deadlines.</p>
     <a className="btn primary" href={route==="exit"?matchPath:matchPath+"/deposit"}>{route==="exit"?"Build an exit quote":"Explore deposits"}</a>
    </div>
   </section>
   <section className="home-how" aria-labelledby="home-how-title">
    <div className="home-section-head"><p className="home-network">How Match works</p><h2 id="home-how-title">Three participants.<br/>One set of agreed terms.</h2></div>
    <div className="home-roles">
     <article><span className="home-role">Exit user</span><h3>Start with USDC.</h3><p>Choose your amount and HyperEVM recipient. Keep your recovery secret private and share the public request with an LP.</p></article>
     <article><span className="home-role">Community LP</span><h3>Supply the quote.</h3><p>Commit WHYPE from your own position. Receive USDC and a quoted share of the protocol fee after settlement.</p></article>
     <article><span className="home-role">Incoming depositor</span><h3>Meet on the other side.</h3><p>Lock HYPE on HyperEVM for the named exit. Receive HYPE on Elysium when the trade settles.</p></article>
    </div>
   </section>
   <section className="home-liquidity">
    <div><p className="home-network">Community liquidity</p><h2>Your inventory.<br/>Your limits.</h2><p>Set how much WHYPE a fill can reserve. Withdraw your available inventory and USDC proceeds. Track reserved funds and claim native HYPE rewards from your position.</p><a className="btn" href={matchPath+"/lp"}>Open LP inventory ↗</a></div>
    <div className="home-principles"><div><strong>Separate positions</strong><p>Each LP controls their own inventory and quote signer.</p></div><div><strong>Fees from settled fills</strong><p>LP bonus comes from the protocol fee, within the campaign cap and deadline.</p></div><div><strong>A visible way back</strong><p>Check each chain's state and claim or refund when its contract conditions allow.</p></div></div>
   </section>
   <section className="home-desk"><div><p className="home-network">The original Shift Desk</p><h2>Follow the book.<br/>Manage your position.</h2><p>Explore Stay, Pull and the scripted Shift leg from our original Elysium testnet desk.</p></div><a className="btn" href={deskPath}>Explore the Desk ↗</a></section>
   <section className="home-ready"><h2>Choose your side of the match.</h2><div className="home-actions"><a className="btn primary" href={matchPath}>Exit to HyperEVM</a><a className="btn" href={matchPath+"/deposit"}>Enter Elysium</a><a className="btn quiet" href="/docs">Read the docs ↗</a></div><p>Both chains need to be available within the signed deadlines. Recovery follows the state of each leg.</p></section>
  </main><SiteFooter/>
 </div>;
}
