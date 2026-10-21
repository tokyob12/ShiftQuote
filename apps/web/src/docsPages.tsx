import type { ReactElement } from "react";
import type { DocsPage } from "./Docs";
import { deployments } from "./deployments";

const hypeFaucet = "https://elysium.kinetiq.xyz/testnet-faucet";
const explorer = "https://elysium.kinetiq.xyz/testnet-explorer";

export function DocArticle({ page }: { page: DocsPage }) {
  const Body = pages[page];
  return <Body />;
}

const pages: Record<DocsPage, () => ReactElement> = {
  home: Home,
  why: Why,
  glossary: Glossary,
  faq: Faq,
  how: How,
  locations: Locations,
  decisions: Decisions,
  math: MathPage,
  contracts: Contracts,
  books: Books,
  testnet: Testnet,
  roadmap: Roadmap,
};

function Home() {
  return (
    <>
      <p className="eyebrow">Introduction</p>
      <h1>One LP. One position.</h1>
      <p>
        Shift keeps an Elysium quote from becoming the stale side of a HyperCore book. The position reads a book snapshot and chooses Stay or Pull. Shift is a separate owner call.
      </p>
      <p>
        <a className="btn primary" href="/desk">
          Open the desk
        </a>
      </p>
      <h2>What this spec covers</h2>
      <p>
        These pages describe the contracts that are deployed, the numbers they use, and who is allowed to call each function. They do not describe a later product.
      </p>
      <ul>
        <li>Band is 50 bps. One Shift moves at most 25% of the Elysium base.</li>
        <li>Stay and Pull update the quote. They do not move tokens off Elysium.</li>
        <li>Shift, Advance, and Return run only while the attached reader is the scripted book. The moved base stays inside the position contract.</li>
      </ul>
      <p className="testnet">
        <span className="testnet-tag">Testnet</span>
        <span>
          The HyperCore leg is scripted. Tokens stay in the contract. This is not an order on HyperCore. The quote in the demo is mUSDC, a mock.
        </span>
      </p>
    </>
  );
}

function Why() {
  return (
    <>
      <p className="eyebrow">Introduction</p>
      <h1>The LP should not be the stale side.</h1>
      <p>
        When the Elysium quote falls behind the HyperCore book, the LP is the one who gets picked off. The pool is still quoting a price the book has already left.
      </p>
      <p>
        Shift is for that LP. It is useful in the first week of a launch, and every day after, for any token with both an Elysium pool and a HyperCore book.
      </p>
      <h2>Stay and Pull are the launch-day decision</h2>
      <p>
        Stay keeps the quote on the new mid while the book is close. Pull takes the quote off when the book moves too far. Both leave the tokens on Elysium. Neither one needs a live order on HyperCore.
      </p>
      <h2>The slice stays with the LP</h2>
      <p>
        The intended resting place of a slice is that LP's own HyperCore account. Shift does not place inventory in a shared pool. On this testnet the slice is still a ledger inside the position contract, and the desk says so.
      </p>
    </>
  );
}

function Glossary() {
  return (
    <>
      <p className="eyebrow">Introduction</p>
      <h1>Glossary</h1>
      <dl className="spec-list">
        <dt>Position</dt>
        <dd>One LP's inventory. Reserves are not shared with any other LP.</dd>
        <dt>Quoted mid</dt>
        <dd>The mid the position is willing to sell base at, stored as quotedMidX18.</dd>
        <dt>midX18</dt>
        <dd>USDC per 1 whole base token, scaled by 1e18. The quote token itself has 6 decimals.</dd>
        <dt>Band</dt>
        <dd>50 bps. BAND_BPS in the position. A wider move Pulls the quote.</dd>
        <dt>Slippage</dt>
        <dd>A number on the book snapshot, in bps. Above 50, evaluate Pulls and shift reverts.</dd>
        <dt>Location</dt>
        <dd>Where the base sits: Uninitialized, Quoted, Pulled, InTransit, OnCoreIdle, or Resting.</dd>
        <dt>Scripted ledger</dt>
        <dd>transitBase, coreIdleBase, and restingBase. Those balances never leave the contract on testnet.</dd>
        <dt>SDA</dt>
        <dd>Shift Demo Asset. 18 decimals. It has no HyperCore spot market.</dd>
        <dt>mUSDC</dt>
        <dd>Mock USDC. 6 decimals. It is not the canonical testnet USDC.</dd>
        <dt>Spot linked</dt>
        <dd>An owner flag. shift reverts with SpotNotLinked until it is true.</dd>
      </dl>
    </>
  );
}

function Faq() {
  return (
    <>
      <p className="eyebrow">Introduction</p>
      <h1>FAQ</h1>
      <h2>Is a Shift an order on HyperCore?</h2>
      <p>No. On this deployment the reader is the scripted book. shift moves base from elysiumBase to transitBase inside the same contract.</p>
      <h2>Can anyone Swap?</h2>
      <p>Yes, while the location is Quoted and the caller holds enough mUSDC and has approved the position. Swap reverts with BadLocation in every other location, including Pulled.</p>
      <h2>Who can Deposit, Shift, Advance, and Return?</h2>
      <p>Only the position owner. A stranger's call reverts with NotOwner.</p>
      <h2>Why is the quote labeled mock?</h2>
      <p>The deployer held none of the canonical testnet USDC, so the demo uses mUSDC. The desk prints "(mock)" next to the balance.</p>
      <h2>Does the ETH ladder on the desk drive Stay and Pull?</h2>
      <p>No. That ladder is a live HyperCore ETH reference. The position reads the attached book, which on this deployment is the scripted book.</p>
      <h2>Does Shift have a token?</h2>
      <p>
        Not today, and the product does not need one. A token may come later, after Shift is live on Elysium mainnet and LPs are using it, to govern the decisions shared across many positions: the protocol fee, the default band, and which book readers and keepers a position may use. It would be announced publicly before any launch. SDA and mUSDC are test inventory for the desk.
      </p>
    </>
  );
}

function How() {
  return (
    <>
      <p className="eyebrow">The position</p>
      <h1>The book moves. The position chooses.</h1>
      <p>One position holds the quote. evaluate reads the attached book and returns Stay or Pull. shift is a separate owner call. It is not the result of evaluate.</p>
      <h2>Stay</h2>
      <p>The book mid is within 50 bps of the quoted mid, and snapshot slippage is at most 50 bps. evaluate sets the quoted mid to the new mid and leaves the location Quoted.</p>
      <h2>Pull</h2>
      <p>The mid has moved more than 50 bps, or slippage is above 50 bps. evaluate sets the location to Pulled and does not change the quoted mid. Swap then reverts. The tokens stay on Elysium.</p>
      <h2>Shift</h2>
      <p>
        The owner calls shift. Spot must be linked, the reader must be scripted, the location must be Quoted or Pulled, and slippage must be at most 50 bps. The call moves 25% of elysiumBase onto transitBase and sets the location to InTransit.
      </p>
      <p>
        The exact predicates are on <a href="/docs/decisions">Decisions</a>. The six locations are on <a href="/docs/locations">Locations</a>.
      </p>
    </>
  );
}

function Locations() {
  return (
    <>
      <p className="eyebrow">The position</p>
      <h1>Where the base sits</h1>
      <p>Location is an enum on the position. Only one location is active. The base token is split across the balances below.</p>
      <table className="spec">
        <thead>
          <tr>
            <th>Location</th>
            <th>Balance that holds the moved base</th>
            <th>What can happen</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-label="Location">Uninitialized</td>
            <td data-label="Balance that holds the moved base">None yet</td>
            <td data-label="What can happen">The first deposit reads the book, stores that mid, and becomes Quoted.</td>
          </tr>
          <tr>
            <td data-label="Location">Quoted</td>
            <td data-label="Balance that holds the moved base">elysiumBase</td>
            <td data-label="What can happen">evaluate can Stay or Pull. swap can sell base at the quoted mid.</td>
          </tr>
          <tr>
            <td data-label="Location">Pulled</td>
            <td data-label="Balance that holds the moved base">elysiumBase</td>
            <td data-label="What can happen">evaluate can return to Quoted if the book comes back inside the band. swap reverts.</td>
          </tr>
          <tr>
            <td data-label="Location">InTransit</td>
            <td data-label="Balance that holds the moved base">transitBase</td>
            <td data-label="What can happen">advanceScripted moves that balance to coreIdleBase.</td>
          </tr>
          <tr>
            <td data-label="Location">OnCoreIdle</td>
            <td data-label="Balance that holds the moved base">coreIdleBase</td>
            <td data-label="What can happen">advanceScripted moves that balance to restingBase.</td>
          </tr>
          <tr>
            <td data-label="Location">Resting</td>
            <td data-label="Balance that holds the moved base">restingBase</td>
            <td data-label="What can happen">returnScripted sends every scripted balance back to elysiumBase and sets Quoted.</td>
          </tr>
        </tbody>
      </table>
      <p>deposit is allowed in Uninitialized, Quoted, and Pulled. It reverts with BadLocation in the three scripted locations. evaluate reverts unless the location is Quoted or Pulled.</p>
    </>
  );
}

function Decisions() {
  return (
    <>
      <p className="eyebrow">The position</p>
      <h1>Stay, Pull, and Shift</h1>
      <h2>evaluate</h2>
      <p>Anyone can call evaluate while the location is Quoted or Pulled. The position reads the attached book and computes:</p>
      <pre className="formula">
        <code>deviation = abs(bookMid - quotedMid) * 10000 / quotedMid</code>
      </pre>
      <p>If deviation is greater than 50, or snapshot slippage is greater than 50, the decision is Pull. Otherwise it is Stay. A zero mid reverts with ZeroAmount.</p>
      <p>Pull sets location to Pulled and leaves quotedMidX18 unchanged. Stay sets location to Quoted and sets quotedMidX18 to the book mid. lastDecision stores the result.</p>
      <h2>preview</h2>
      <p>
        preview is the view form of that read. Outside Quoted and Pulled it returns the last decision and the stored mid without touching the book. Inside those two locations it calls read, so a stale keeper snapshot reverts with Stale.
      </p>
      <h2>swap</h2>
      <p>
        swap sells baseOut of SDA at the stored quoted mid. It reverts unless the location is Quoted. The caller pays mUSDC and receives SDA. The quote pulled from the caller is added to elysiumQuote, and elysiumBase falls by baseOut.
      </p>
      <h2>shift</h2>
      <p>Only the owner. The call reverts unless all of these hold:</p>
      <ul>
        <li>reader.isScripted() is true. Otherwise NotScripted.</li>
        <li>spotLinked is true. Otherwise SpotNotLinked.</li>
        <li>Location is Quoted or Pulled. Otherwise BadLocation.</li>
        <li>Snapshot slippage is at most 50 bps. Otherwise Slippage.</li>
      </ul>
      <pre className="formula">
        <code>slice = elysiumBase * 2500 / 10000</code>
      </pre>
      <p>That slice moves from elysiumBase to transitBase. Location becomes InTransit and lastDecision becomes Shift. shift does not check whether the book mid is inside the band. That check belongs to evaluate.</p>
      <h2>advanceScripted and returnScripted</h2>
      <p>Both are owner-only and require the scripted reader. advanceScripted walks InTransit to OnCoreIdle, then OnCoreIdle to Resting. returnScripted adds transitBase + coreIdleBase + restingBase back to elysiumBase, zeroes those three fields, and sets the location to Quoted with lastDecision Stay.</p>
    </>
  );
}

function MathPage() {
  return (
    <>
      <p className="eyebrow">Math</p>
      <h1>Pricing</h1>
      <p>midX18 is USDC per one whole base token, scaled by 1e18. SDA has 18 decimals. mUSDC has 6.</p>
      <pre className="formula">
        <code>usdcIn = baseOut * midX18 / 1e30</code>
      </pre>
      <p>The 1e30 is 1e18 from the base token times 1e18 from the price, divided down to 6-decimal quote units. A result of zero reverts with ZeroAmount.</p>
      <h2>One SDA at one dollar</h2>
      <p>baseOut is 1e18. midX18 is 1e18. usdcIn is 1e18 * 1e18 / 1e30 = 1e6. The buyer pays 1.000000 mUSDC and receives 1 SDA.</p>
      <h2>A 60 bps move</h2>
      <p>Quoted mid is 1e18. The book mid is 1.006e18. deviation is 0.006e18 * 10000 / 1e18 = 60. That is above 50, so evaluate returns Pull even if slippage is 0.</p>
      <h2>The book mid</h2>
      <p>Both books store a bid and an ask. read sets midX18 to (bid + ask) / 2. set and setSnapshot revert with BadPrice when the bid is zero or the ask is below the bid.</p>
    </>
  );
}

function Contracts() {
  return (
    <>
      <p className="eyebrow">Contracts</p>
      <h1>Deployment</h1>
      <p>Elysium testnet, chain id {deployments.chainId}. The demo LP is the contract owner.</p>
      <table className="spec">
        <thead>
          <tr>
            <th>Contract</th>
            <th>Address</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-label="Contract">Position</td>
            <td data-label="Address">
              <code>{deployments.position}</code>
            </td>
          </tr>
          <tr>
            <td data-label="Contract">SDA</td>
            <td data-label="Address">
              <code>{deployments.demoAsset}</code>
            </td>
          </tr>
          <tr>
            <td data-label="Contract">mUSDC</td>
            <td data-label="Address">
              <code>{deployments.quote}</code>
            </td>
          </tr>
          <tr>
            <td data-label="Contract">Scripted book</td>
            <td data-label="Address">
              <code>{deployments.scriptedBook}</code>
            </td>
          </tr>
          <tr>
            <td data-label="Contract">Keeper book</td>
            <td data-label="Address">
              <code>{deployments.keeperBook}</code>
            </td>
          </tr>
          <tr>
            <td data-label="Contract">Faucet</td>
            <td data-label="Address">
              <code>{deployments.faucet}</code>
            </td>
          </tr>
        </tbody>
      </table>
      <h2>Who can call</h2>
      <table className="spec">
        <thead>
          <tr>
            <th>Call</th>
            <th>Caller</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-label="Call">evaluate, preview, swap</td>
            <td data-label="Caller">Anyone. swap still has to pass the location check and pay mUSDC.</td>
          </tr>
          <tr>
            <td data-label="Call">deposit, setSpotLinked, shift, advanceScripted, returnScripted</td>
            <td data-label="Caller">Position owner. Otherwise NotOwner.</td>
          </tr>
          <tr>
            <td data-label="Call">ScriptedBook.set</td>
            <td data-label="Caller">Book owner.</td>
          </tr>
          <tr>
            <td data-label="Call">KeeperBook.setSnapshot</td>
            <td data-label="Caller">Keeper. Otherwise NotKeeper.</td>
          </tr>
          <tr>
            <td data-label="Call">Faucet.drip</td>
            <td data-label="Caller">Anyone, once an hour. The faucet cannot mint. It only transfers a balance it already holds.</td>
          </tr>
        </tbody>
      </table>
      <h2>Errors</h2>
      <p>
        NotOwner, BadLocation, NotScripted, SpotNotLinked, Slippage, ZeroAmount, and TransferFailed come from the position. TransferFailed means the ERC-20 transfer or transferFrom returned false. SDA and mUSDC can only be minted by their minter, which is the deployer.
      </p>
    </>
  );
}

function Books() {
  return (
    <>
      <p className="eyebrow">Books</p>
      <h1>Two readers, one shape</h1>
      <p>
        IHyperCoreBook.read returns bid, ask, mid, slippage in bps, a core height, and a timestamp. The position does not call a HyperCore precompile. It calls whichever reader was set in the constructor.
      </p>
      <h2>Scripted book</h2>
      <p>
        isScripted returns true. read stamps block.timestamp, so the snapshot does not expire during a demo. The owner sets bid, ask, slippage, and core height. This is the reader attached to the live position, so Shift, Advance, and Return are available.
      </p>
      <h2>Keeper book</h2>
      <p>
        isScripted returns false. A keeper posts a snapshot. read reverts with Stale when the post is older than 15 seconds, or when the bid is still zero. If this reader were attached, shift, advanceScripted, and returnScripted would revert with NotScripted. Stay and Pull would still run, and a stale post would revert preview and evaluate.
      </p>
      <h2>Spot book for the second position</h2>
      <p>
        A second KeeperBook holds the HyperCore HYPE/USDC spot book, coin @107, for the WHYPE position. The keeper posts it every 5 seconds from the public API.
      </p>
      <p>
        One exception is on record. On 21 October 2026, around 07:55 UTC, a stale quoted mid was walked from 78.58 to 81.83. Swaps were closed for the whole window, from block 12681625 to 12681947, so nothing traded during it. Nine snapshots were posted by hand, starting at block 12681647. Each had the bid equal to the ask, 40 bps above the last, and those prices did not come from HyperCore. The tenth posted the live book once the gap was inside 50 bps, and evaluate in block 12681931 stored 81.8335. A later deployment adds an owner requote, so the mid can be reset from a fresh read instead.
      </p>
      <h2>The ETH ladder on the desk</h2>
      <p>
        The desk also draws the live HyperCore ETH book from the public API. That ladder is a reference. It is not SDA's market, and the position does not read it when it decides.
      </p>
    </>
  );
}

function Testnet() {
  return (
    <>
      <p className="eyebrow">Testnet</p>
      <h1>Try the desk</h1>
      <dl className="spec-list">
        <dt>Chain</dt>
        <dd>Elysium testnet, id 99801.</dd>
        <dt>RPC</dt>
        <dd>https://testnet-rpc.elysium.kinetiq.xyz</dd>
        <dt>Explorer</dt>
        <dd>
          <a href={explorer}>{explorer}</a>
        </dd>
        <dt>HYPE faucet</dt>
        <dd>
          <a href={hypeFaucet}>{hypeFaucet}</a>. Gas is HYPE.
        </dd>
      </dl>
      <h2>Test inventory</h2>
      <ol>
        <li>Connect a wallet on Elysium testnet.</li>
        <li>Get HYPE from the faucet above.</li>
        <li>On the desk, use Get test tokens. The faucet sends 1,000 SDA and 1,000 mUSDC, then waits one hour for that address.</li>
        <li>Evaluate, then Swap. Swap spends mUSDC and buys SDA at the quoted mid.</li>
      </ol>
      <p>Deposit, Set scripted book, Link spot, Shift, Advance, and Return stay on the LP wallet. Another wallet can read the position and, once it holds mUSDC, Swap while the position is Quoted.</p>
      <h2>The live position</h2>
      <p>
        The same desk also shows a second position. Its base is canonical WHYPE. A keeper posts the HyperCore HYPE/USDC book, coin @107. Swap on that position reads the snapshot in the same transaction. The quote is still mUSDC. The slice stays in the contract. This is not an order on HyperCore. If the keeper is not posting, the snapshot is stale and the swap reverts.
      </p>
    </>
  );
}

function Roadmap() {
  return (
    <>
      <p className="eyebrow">Roadmap</p>
      <h1>What is next</h1>
      <p>The testnet desk is the part that runs today. Three things are still in front of a live quote:</p>
      <ul>
        <li>Canonical USDC in place of mUSDC.</li>
        <li>A keeper snapshot of the listed token's own HyperCore book, fresh within 15 seconds, used by evaluate.</li>
        <li>The slice leaving the scripted ledger and resting on that LP's own HyperCore account.</li>
      </ul>
      <h2>What this deployment is not</h2>
      <ul>
        <li>An order on HyperCore.</li>
        <li>A shared inventory pool.</li>
        <li>A perp.</li>
        <li>A Shift token. There is none today.</li>
      </ul>
      <h2>Later: a governance token</h2>
      <p>
        After mainnet, once LPs are using Shift, a token may govern the decisions shared across positions: the protocol fee, the default band, and which book readers and keepers are allowed. Nothing above depends on it. Timing depends on adoption, and it will be announced publicly first.
      </p>
      <p>Until the write path from Elysium to that LP's HyperCore account exists, the HyperCore leg stays scripted and the desk keeps the testnet line on screen.</p>
    </>
  );
}
