import type { ReactElement } from "react";
import type { DocsPage } from "./Docs";
import { deployments } from "./deployments";
import { matchDeployments } from "./matchDeployments";

const hypeFaucet = "https://testnet.elysium.kinetiq.xyz/faucet";
const explorer = "https://testnet.elysium.kinetiq.xyz/explorer";

export function DocArticle({ page }: { page: DocsPage }) {
  const Body = pages[page];
  return <Body />;
}

const pages: Record<DocsPage, () => ReactElement> = {
  home: Home,
  match: MatchGuide,
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
      <p className="eyebrow">Shift documentation</p>
      <h1>Desk liquidity meets cross-chain Match.</h1>
      <p>
        Shift has two parts. Desk manages an LP’s quote with Stay, Pull and a
        scripted Shift inventory leg. Match adds a USDC-to-HYPE exit route,
        connecting an LP’s Elysium inventory with an incoming HyperEVM depositor.
      </p>
      <h2>Start with Desk or Match</h2>
      <p>
        Open <a href="/desk">Desk</a> for the submitted demo and the live-book
        WHYPE position. Open <a href="/match">Match</a> for the coordinated
        cross-chain pilot. Desk and Match currently use separate positions;
        the scripted Shift action does not fund a Match. Match LPs supply
        inventory through the <a href="/match/lp">LP page</a>.
      </p>
      <p>
        The current application runs on Elysium testnet and HyperEVM testnet. It
        uses test mUSDC, WHYPE and native HYPE.
      </p>
      <h2>Choose your role</h2>
      <ul>
        <li>
          <a href="/match">Exit user</a> — reserve USDC on Elysium and receive
          HYPE on HyperEVM.
        </li>
        <li>
          <a href="/match/deposit">Depositor</a> — lock HYPE on HyperEVM and
          receive HYPE on Elysium.
        </li>
        <li>
          <a href="/match/lp">Liquidity provider</a> — quote WHYPE from an
          individual position and receive USDC plus the accepted bonus.
        </li>
      </ul>
      <h2>Start with a coordinated trial</h2>
      <p>
        Arrange an LP and incoming depositor, then prepare a public request.
        Share links between participants while keeping the exit user's recovery
        secret private. Read the amounts and both deadlines before reserving
        funds.
      </p>
      <p>
        <a href="/docs/match">Match and recovery guide</a> ·{" "}
        <a href="/docs/testnet">Networks and test tokens</a> ·{" "}
        <a href="/docs/math">Fees and pricing</a>
      </p>
      <h2>The original Desk</h2>
      <p>
        The submitted Desk remains available at <a href="/desk">/desk</a>. Its
        Stay, Pull and scripted Shift states have their own reference pages.
        Match positions use available and reserved inventory rather than that
        state sequence.
      </p>
    </>
  );
}

function Why() {
  return (
    <>
      <p className="eyebrow">Why Shift</p>
      <h1>A quote for the complete exit.</h1>
      <p>
        A trader who holds USDC on Elysium may want HYPE on HyperEVM. Match
        combines an LP's local conversion quote with a participant who wants to
        enter Elysium.
      </p>
      <h2>Commit the two Elysium assets together</h2>
      <p>
        Funding moves the exit's USDC and the LP's WHYPE into the same source
        fill. USDC reaches the LP through settlement. An eligible source refund
        returns the original assets to their original owners.
      </p>
      <h2>Give incoming HYPE a useful destination</h2>
      <p>
        The depositor pays the exit on HyperEVM and receives inventory already
        on Elysium. The difference between these amounts provides the quoted
        depositor bonus before their gas costs.
      </p>
      <h2>Measure the result</h2>
      <p>
        Compare the full route with a local swap followed by an available
        cross-chain offer. Use the same starting USDC, final HYPE asset, gas
        convention and deadline. Check failed matches and waiting time alongside
        received amounts.
      </p>
      <h2>Respect the timing assumptions</h2>
      <p>
        The chains settle separately. If HyperEVM has paid but Elysium remains
        unavailable beyond the source safety window, a timing risk remains.
        Testnet exercises success, timeout and recovery paths before a broader
        release.
      </p>
    </>
  );
}

function Glossary() {
  return (
    <>
      <p className="eyebrow">Reference</p>
      <h1>Glossary</h1>
      <dl className="spec-list">
        <dt>Exit user</dt>
        <dd>The wallet offering Elysium USDC for HyperEVM HYPE.</dd>
        <dt>Depositor</dt>
        <dd>The wallet paying HyperEVM HYPE to receive Elysium HYPE.</dd>
        <dt>Community LP</dt>
        <dd>
          An owner of a separate WHYPE position that supplies the conversion
          inventory.
        </dd>
        <dt>WHYPE</dt>
        <dd>
          Wrapped native HYPE on Elysium. LP inventory is held as WHYPE and
          successful native payouts are unwrapped.
        </dd>
        <dt>mUSDC</dt>
        <dd>The mock 6-decimal USDC token used in this testnet deployment.</dd>
        <dt>Public request</dt>
        <dd>
          Trade terms, a secret hash and any LP signature. It can be shared by
          link.
        </dd>
        <dt>Private recovery secret</dt>
        <dd>
          The exit user's secret that authorizes both claims after the
          destination is safely funded. Keep the recovery file private.
        </dd>
        <dt>Reserved inventory</dt>
        <dd>WHYPE committed to an accepted fill until settlement or refund.</dd>
        <dt>Claimable credit</dt>
        <dd>
          HYPE assigned to a beneficiary inside a contract, ready for a separate
          wallet withdrawal.
        </dd>
        <dt>Spread</dt>
        <dd>The margin included in the LP's USDC/WHYPE quote.</dd>
        <dt>Protocol fee</dt>
        <dd>
          The HYPE amount taken from a successfully settled WHYPE slice, with
          any accepted LP bonus paid from it.
        </dd>
        <dt>Claim deadline</dt>
        <dd>
          The HyperEVM time after which an unclaimed lock can be refunded.
        </dd>
        <dt>Refund deadline</dt>
        <dd>
          The later Elysium time after which an unsettled source can refund its
          original assets.
        </dd>
        <dt>Desk</dt>
        <dd>
          The original Shift interface with Stay, Pull and a scripted HyperCore
          inventory leg.
        </dd>
        <dt>HyperCore reference</dt>
        <dd>
          Market data used to help price an LP quote. The accepted signature
          fixes that fill's amounts.
        </dd>
      </dl>
    </>
  );
}

function Faq() {
  return (
    <>
      <p className="eyebrow">Questions</p>
      <h1>FAQ</h1>
      <h2>What do I receive?</h2>
      <p>
        An exit user receives native test HYPE on HyperEVM. A depositor receives
        native test HYPE on Elysium. The LP receives test USDC proceeds and any
        accepted native HYPE bonus.
      </p>
      <h2>Who supplies the money?</h2>
      <p>
        The exit user supplies USDC, the LP supplies WHYPE on Elysium, and the
        depositor supplies HYPE on HyperEVM. Each participant approves their own
        part.
      </p>
      <h2>How do I find a match?</h2>
      <p>
        This testnet release supports coordinated participants. Arrange the LP
        and incoming wallet, prepare a request, and share its public links. The
        app verifies funding conditions before the next leg.
      </p>
      <h2>Can I leave while waiting?</h2>
      <p>
        Before funding, funds remain in your wallet. Once funded, the signed
        claim and refund deadlines control recovery. Check the Recovery page for
        your actual chain state.
      </p>
      <h2>Why does Receive ask for two confirmations?</h2>
      <p>
        Claim first assigns the HyperEVM credit. Take then sends that credit to
        the recipient wallet. The Receive action guides both transactions.
      </p>
      <h2>Who gets the recovery secret?</h2>
      <p>
        The exit wallet keeps it private until claiming the funded destination.
        Share the public request link with the LP and depositor. Save a private
        recovery file in case the browser session is lost.
      </p>
      <h2>What happens if the executor stops?</h2>
      <p>
        Recovery provides manual source settlement and credit withdrawals.
        Expired, eligible locks can be refunded. Completing the second leg
        promptly matters after the destination has paid.
      </p>
      <h2>Can an LP withdraw?</h2>
      <p>
        Available WHYPE and earned USDC can be withdrawn. Reserved WHYPE
        completes its existing trade or eligible refund first. The LP can pause
        new fills and set reservation limits.
      </p>
      <h2>How much does the LP earn?</h2>
      <p>
        Its signed conversion price includes its spread. The campaign can also
        pay 20% of the collected protocol fee within its cap and 30-day
        deadline. Price changes, gas and inventory replacement costs affect the
        result.
      </p>
      <h2>Which wallet represents Shift?</h2>
      <p>
        The source admin, seeded LP owner, quote signer and treasury are{" "}
        <code>0x1329818d4a89a1ea42e9F78c84009A79b8F269f2</code>.
      </p>
      <h2>Is a Shift token required?</h2>
      <p>
        Testnet participants use mUSDC, HYPE and WHYPE. Fees and LP rewards are
        calculated from settled fills. Any future token proposal would need a
        separate announcement.
      </p>
    </>
  );
}

function How() {
  return (
    <>
      <p className="eyebrow">Settlement</p>
      <h1>From a public request to HYPE.</h1>
      <ol>
        <li>
          The exit user enters USDC, recipient details and the incoming
          participant. The browser creates the secret privately and includes
          only its hash in the public request.
        </li>
        <li>
          The LP signs all fill terms, including amounts, gas budgets,
          destinations, bonus and deadlines.
        </li>
        <li>
          The exit user funds the Elysium side. USDC and the LP's WHYPE reserve
          in one source transaction.
        </li>
        <li>
          The depositor verifies the source and locks the payment plus its gas
          allowance on HyperEVM.
        </li>
        <li>
          The exit user verifies the exact lock and confirmations, then reveals
          the secret to claim HyperEVM credit and withdraw it.
        </li>
        <li>
          The executor observes the confirmed claim and settles Elysium. USDC
          pays the LP. Unwrapped HYPE credits the depositor, bonus recipient,
          treasury and any gas executor.
        </li>
      </ol>
      <h2>When a trade times out</h2>
      <p>
        HyperEVM refunds an unclaimed payment and unused gas allowance after its
        claim deadline. Elysium refunds an unsettled fill after its later refund
        deadline. The original USDC and WHYPE return to their owners.
      </p>
      <h2>After the destination has paid</h2>
      <p>
        The Elysium leg must settle before its refund deadline. A long chain
        outage can exceed the safety window. Keep the recovery file and use
        manual settlement if the automated executor is unavailable.
      </p>
      <h2>Original Desk reference</h2>
      <p>
        The <a href="/desk">Desk</a> reads its book and chooses Stay or Pull.
        Its Shift action tracks the scripted inventory leg. See{" "}
        <a href="/docs/locations">Desk locations</a> and{" "}
        <a href="/docs/decisions">Desk decisions</a> for those states.
      </p>
    </>
  );
}

function Locations() {
  return (
    <>
      <p className="eyebrow">The position</p>
      <h1>Where the base sits</h1>
      <p>
        Location is an enum on the position. Only one location is active. The
        base token is split across the balances below.
      </p>
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
            <td data-label="What can happen">
              The first deposit reads the book, stores that mid, and becomes
              Quoted.
            </td>
          </tr>
          <tr>
            <td data-label="Location">Quoted</td>
            <td data-label="Balance that holds the moved base">elysiumBase</td>
            <td data-label="What can happen">
              evaluate can Stay or Pull. swap can sell base at the quoted mid.
            </td>
          </tr>
          <tr>
            <td data-label="Location">Pulled</td>
            <td data-label="Balance that holds the moved base">elysiumBase</td>
            <td data-label="What can happen">
              evaluate can return to Quoted if the book comes back inside the
              band. swap reverts.
            </td>
          </tr>
          <tr>
            <td data-label="Location">InTransit</td>
            <td data-label="Balance that holds the moved base">transitBase</td>
            <td data-label="What can happen">
              advanceScripted moves that balance to coreIdleBase.
            </td>
          </tr>
          <tr>
            <td data-label="Location">OnCoreIdle</td>
            <td data-label="Balance that holds the moved base">coreIdleBase</td>
            <td data-label="What can happen">
              advanceScripted moves that balance to restingBase.
            </td>
          </tr>
          <tr>
            <td data-label="Location">Resting</td>
            <td data-label="Balance that holds the moved base">restingBase</td>
            <td data-label="What can happen">
              returnScripted sends every scripted balance back to elysiumBase
              and sets Quoted.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        deposit is allowed in Uninitialized, Quoted, and Pulled. It reverts with
        BadLocation in the three scripted locations. evaluate reverts unless the
        location is Quoted or Pulled.
      </p>
    </>
  );
}

function Decisions() {
  return (
    <>
      <p className="eyebrow">The position</p>
      <h1>Stay, Pull, and Shift</h1>
      <h2>evaluate</h2>
      <p>
        Anyone can call evaluate while the location is Quoted or Pulled. The
        position reads the attached book and computes:
      </p>
      <pre className="formula">
        <code>deviation = abs(bookMid - quotedMid) * 10000 / quotedMid</code>
      </pre>
      <p>
        If deviation is greater than 50, or snapshot slippage is greater than
        50, the decision is Pull. Otherwise it is Stay. A zero mid reverts with
        ZeroAmount.
      </p>
      <p>
        Pull sets location to Pulled and leaves quotedMidX18 unchanged. Stay
        sets location to Quoted and sets quotedMidX18 to the book mid.
        lastDecision stores the result.
      </p>
      <h2>preview</h2>
      <p>
        preview is the view form of that read. Outside Quoted and Pulled it
        returns the last decision and the stored mid without touching the book.
        Inside those two locations it calls read, so a stale keeper snapshot
        reverts with Stale.
      </p>
      <h2>swap</h2>
      <p>
        swap sells baseOut of SDA at the stored quoted mid. It reverts unless
        the location is Quoted. The caller pays mUSDC and receives SDA. The
        quote pulled from the caller is added to elysiumQuote, and elysiumBase
        falls by baseOut.
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
      <p>
        That slice moves from elysiumBase to transitBase. Location becomes
        InTransit and lastDecision becomes Shift. shift does not check whether
        the book mid is inside the band. That check belongs to evaluate.
      </p>
      <h2>advanceScripted and returnScripted</h2>
      <p>
        Both are owner-only and require the scripted reader. advanceScripted
        walks InTransit to OnCoreIdle, then OnCoreIdle to Resting.
        returnScripted adds transitBase + coreIdleBase + restingBase back to
        elysiumBase, zeroes those three fields, and sets the location to Quoted
        with lastDecision Stay.
      </p>
    </>
  );
}

function MathPage() {
  return (
    <>
      <p className="eyebrow">Pricing</p>
      <h1>Follow every part of the quote.</h1>
      <p>
        USDC uses 6 decimals and HYPE/WHYPE use 18. Contract arithmetic uses
        integer units and rounds down unless the quote service explicitly rounds
        a cost up.
      </p>
      <h2>The LP conversion</h2>
      <p>
        The market-reference helper walks HyperCore asks for the requested size
        and includes a 10 bps LP spread suggestion. The LP approves the
        executable quote. It can agree different terms in Advanced settings. A
        stale snapshot or insufficient visible depth rejects the suggested
        quote.
      </p>
      <h2>Match amounts</h2>
      <pre className="formula">
        <code>{`Q = LP WHYPE supplied
P = floor(Q × 9980 / 10000)
F = floor(Q × 5 / 10000)
D = Q − F − Elysium gas allowance
HyperEVM lock = P + HyperEVM gas allowance`}</code>
      </pre>
      <p>
        P goes to the exit user on HyperEVM. D goes to the depositor on Elysium.
        F is the protocol fee from the Elysium slice. Gas paid directly by
        wallets is an additional transaction cost.
      </p>
      <h2>An illustrative 800 USDC quote</h2>
      <p>
        If the LP supplies 10 WHYPE for 800 USDC, P is 9.98 HYPE, F is 0.005
        HYPE and D is 9.995 HYPE before any gas allowance. The depositor
        difference is 0.015 HYPE before its gas costs. The quoted exchange price
        and inventory costs determine the LP's economic result.
      </p>
      <h2>LP bonus</h2>
      <p>
        The campaign can reserve 20% of F for the LP. In that example the bonus
        is 0.001 HYPE and the remaining protocol share is 0.004 HYPE before
        operating costs. The 1 HYPE campaign cap and 30-day campaign deadline
        restrict new bonus commitments. The accepted fill stores its exact bonus
        through settlement or refund.
      </p>
      <h2>Original Desk math</h2>
      <p>
        The original Desk converts base token units at its mid using{" "}
        <code>usdcIn = baseOut × midX18 / 1e30</code>. Its 50 bps band controls
        Stay/Pull decisions. These are the original Desk's pricing rules.
      </p>
    </>
  );
}

function Contracts() {
  return (
    <>
      <p className="eyebrow">Deployment</p>
      <h1>Match testnet contracts.</h1>
      <p>
        Elysium testnet is chain 99801. HyperEVM testnet is chain 998. Verify
        both the address and network when reading a receipt.
      </p>
      <dl className="spec-list">
        <dt>SourceMatch · Elysium</dt>
        <dd>
          <code>{matchDeployments.sourceMatch}</code>
        </dd>
        <dt>DestMatch · HyperEVM</dt>
        <dd>
          <code>{matchDeployments.destMatch}</code>
        </dd>
        <dt>LP factory · Elysium</dt>
        <dd>
          <code>{matchDeployments.factory}</code>
        </dd>
        <dt>Seeded LP position · Elysium</dt>
        <dd>
          <code>{matchDeployments.position}</code>
        </dd>
        <dt>WHYPE · Elysium</dt>
        <dd>
          <code>{matchDeployments.whype}</code>
        </dd>
        <dt>mUSDC · Elysium</dt>
        <dd>
          <code>{matchDeployments.usdc}</code>
        </dd>
      </dl>
      <h2>Ownership and signing</h2>
      <p>
        The seeded position owner, source admin, treasury and quote signer are{" "}
        <code>0x1329818d4a89a1ea42e9F78c84009A79b8F269f2</code>. New LPs create
        positions owned by their own wallets. A quote signer authorizes exact
        fills. Withdrawal remains under the position owner's control.
      </p>
      <h2>What the contracts enforce</h2>
      <p>
        Source accepts factory-registered positions with the configured tokens.
        LP signatures bind the complete fill and destination deployment. Nonces,
        one-time secret hashes, minimum timeout spacing, a maximum lock
        duration, inventory limits and campaign budget checks constrain accepted
        fills.
      </p>
      <p>
        Destination claims and source settlement assign fixed beneficiary
        amounts. Native credits are withdrawn separately. Destination refunds
        include the unused gas allowance.
      </p>
      <h2>Original Desk deployment</h2>
      <dl className="spec-list">
        <dt>Submitted position</dt>
        <dd>
          <code>{deployments.position}</code>
        </dd>
        <dt>Live-book position</dt>
        <dd>
          <code>{deployments.v2.position}</code>
        </dd>
        <dt>Scripted book</dt>
        <dd>
          <code>{deployments.scriptedBook}</code>
        </dd>
        <dt>HYPE keeper book</dt>
        <dd>
          <code>{deployments.v2.keeperBook}</code>
        </dd>
        <dt>Test token faucet</dt>
        <dd>
          <code>{deployments.faucet}</code>
        </dd>
      </dl>
      <p>
        <a href={explorer}>Open the Elysium testnet explorer</a>. Current
        deployment configuration is recorded in the repository alongside the
        transaction evidence.
      </p>
    </>
  );
}

function Books() {
  return (
    <>
      <p className="eyebrow">Market reference</p>
      <h1>From book data to an accepted quote.</h1>
      <p>
        Match's reference helper reads the HyperCore HYPE/USDC book, checks the
        source timestamp and walks the ask levels for the size it can buy within
        the entered USDC budget. It suggests a 10 bps LP spread. Snapshot age
        over 15 seconds, invalid levels and insufficient depth reject the
        reference.
      </p>
      <h2>The LP approves the price</h2>
      <p>
        The reference helps participants agree a quote. The LP signs the amounts
        and complete trade terms. After source funding, those amounts remain
        fixed for that fill. Market movement during the reservation can affect
        the LP's result.
      </p>
      <h2>Original Desk keeper</h2>
      <p>
        The Desk's KeeperBook checks the age of its on-chain post. Its legacy
        read method uses a single posted slippage value and ignores the size
        argument. The boundQuote helper binds size and direction into an
        identifier. Match's size-aware reference calculation is performed
        separately.
      </p>
      <h2>After an Elysium upgrade</h2>
      <p>
        A future integration could use native HyperCore reads and trading
        support when available and validated. Match's current two-chain
        settlement uses its source and destination contracts.
      </p>
    </>
  );
}

function Testnet() {
  return (
    <>
      <p className="eyebrow">Get started</p>
      <h1>Try Match with three wallets.</h1>
      <p>
        Use an exit wallet, an LP wallet and an incoming depositor wallet. Each
        needs test HYPE for transactions on the networks where it acts.
      </p>
      <dl className="spec-list">
        <dt>Elysium testnet</dt>
        <dd>
          Chain 99801 · <code>https://testnet-rpc.elysium.kinetiq.xyz</code>
        </dd>
        <dt>HyperEVM testnet</dt>
        <dd>
          Chain 998 · <code>https://rpc.hyperliquid-testnet.xyz/evm</code>
        </dd>
        <dt>Elysium HYPE faucet</dt>
        <dd>
          <a href={hypeFaucet}>{hypeFaucet}</a>
        </dd>
        <dt>Explorer</dt>
        <dd>
          <a href={explorer}>{explorer}</a>
        </dd>
      </dl>
      <h2>Prepare the participants</h2>
      <ol>
        <li>
          LP opens <a href="/match/lp">LP inventory</a>, creates a position,
          wraps test HYPE and deposits WHYPE.
        </li>
        <li>
          Exit wallet opens <a href="/match">Exit</a>, gets test mUSDC and
          enters the incoming participant's wallet.
        </li>
        <li>
          Exit prepares a request, saves its private recovery file and shares
          the public LP link.
        </li>
        <li>LP reviews the exact terms and returns the signed public link.</li>
        <li>
          Exit reserves its USDC. Depositor opens its link and locks HyperEVM
          HYPE.
        </li>
        <li>
          Exit chooses Receive my HYPE and confirms the claim and withdrawal.
          The executor or manual Recovery action finishes Elysium settlement.
        </li>
      </ol>
      <h2>Run the timeout trial</h2>
      <p>
        Fund a source and destination, then allow their deadlines to pass
        without revealing the secret. Recovery enables the eligible refund
        actions. Check the full HyperEVM payment and unused gas allowance, the
        exit's original USDC, and the LP's restored available WHYPE.
      </p>
      <h2>Save the recovery file</h2>
      <p>
        The public request can be shared. Keep the secret in the exit browser or
        private recovery file. Recovery can restore that file after importing
        the matching public request. Browser history keeps recent public
        requests.
      </p>
      <h2>Explore the submitted Desk</h2>
      <p>
        Open <a href="/desk">Desk</a> to try SDA/mUSDC and its WHYPE position.
        The scripted HyperCore leg remains part of that original demonstration.
      </p>
    </>
  );
}

function Roadmap() {
  return (
    <>
      <p className="eyebrow">Release path</p>
      <h1>From testnet evidence to production.</h1>
      <h2>Testnet implementation</h2>
      <p>
        The application includes separate LP positions, full-term signed quotes,
        two-chain escrow, native payouts, campaign-limited LP bonus,
        original-asset refunds, public request links, private recovery files and
        settlement monitoring. Current addresses are on the Deployment page.
      </p>
      <h2>Validation</h2>
      <p>
        The 6 November 2026 test run completed actual two-chain settlement,
        native payouts, deadline-based refunds and a three-wallet browser flow.
        Repeat these checks after deployment. Compare received HYPE, gas,
        waiting time and failed matches with available routes. Keep
        team-generated test trades separate from independent demand.
      </p>
      <h2>Operation</h2>
      <p>
        The executor and watcher need an always-on deployment, a funded gas
        wallet and monitored RPC access. Cursor's deployment handoff includes
        the service configuration and testnet receipts.
      </p>
      <h2>Before mainnet</h2>
      <p>
        Verify production token mappings, independently review the cross-chain
        timing model, set measured finality and timeout parameters, agree user
        and LP exposure caps, and complete partner and liquidity pilots.
        Canonical USDC replaces the test mock in a separately validated
        production deployment.
      </p>
      <h2>Later extensions</h2>
      <p>
        Broader discovery and automatic coordination, multiple LP fills,
        optional inventory rebalancing and validated HyperCore integrations can
        expand the initial route. Adoption and measured execution quality guide
        those choices.
      </p>
    </>
  );
}

function MatchGuide() {
  return (
    <>
      <p className="eyebrow">Testnet Match</p>
      <h1>Know where your funds are.</h1>
      <p>
        Match combines an Elysium LP quote with an incoming HyperEVM depositor.
        The exit user pays test mUSDC on Elysium and receives native test HYPE
        on HyperEVM.
      </p>
      <h2>Prepare and share a request</h2>
      <p>
        Enter your USDC amount and the incoming participant's wallet. In this
        coordinated testnet trial, arrange an LP and depositor before funding.
        Prepare a public request, save your private recovery file, and copy the
        LP link. Only the exit wallet should know the secret.
      </p>
      <h2>Review the signed quote</h2>
      <p>
        The LP approves exact amounts, recipients, gas budgets, bonus and
        deadlines. Import the signed link to review what each participant
        receives. Funding reserves the exit's USDC and the LP's WHYPE together
        on Elysium.
      </p>
      <h2>Commit the other side</h2>
      <p>
        The depositor checks the funded source and locks HYPE on HyperEVM. The
        exit user can then choose Receive HYPE. Two wallet confirmations claim
        and withdraw the payment on HyperEVM.
      </p>
      <h2>Finish settlement</h2>
      <p>
        A relayer observes the confirmed HyperEVM claim and settles Elysium. The
        LP receives USDC. HYPE becomes claimable for the depositor, LP bonus,
        protocol fee and any executor gas allowance. Recovery also offers manual
        settlement and credit collection.
      </p>
      <h2>Refund deadlines</h2>
      <p>
        If the destination claim deadline passes without a claim, the depositor
        can refund the full HyperEVM lock including its unused gas budget. After
        the later Elysium refund deadline, an unsettled source can return the
        original USDC and WHYPE. Gas already spent on transactions remains a
        cost.
      </p>
      <p>
        A claimed destination followed by an Elysium outage longer than the
        safety window creates a timing risk. Keep the recovery file and allow
        the executor to finish the second leg promptly. The app displays the
        separate deadlines before funds are committed.
      </p>
      <h2>Provide liquidity</h2>
      <p>
        Create your own position, wrap test HYPE and deposit WHYPE. Set a
        reservation limit and pause new fills when needed. Available WHYPE and
        earned USDC can be withdrawn. Reserved WHYPE remains committed until
        settlement or refund. Selling WHYPE builds a USDC balance, so you may
        need to replenish inventory.
      </p>
      <p>
        The LP earns the spread in its approved quote. During the campaign it
        can also earn 20% of the collected protocol fee, within the 30-day
        campaign and cap. Bonus is reserved per accepted fill. Inventory price
        changes and gas affect the LP's result.
      </p>
      <h2>Testnet wallet</h2>
      <p>
        The project wallet, source administrator, seeded LP owner, quote signer
        and treasury are 0x1329818d4a89a1ea42e9F78c84009A79b8F269f2. Deployment
        addresses are recorded in the repository. Use the separate Elysium and
        HyperEVM testnet networks for each leg.
      </p>
      <p>
        <a href="/match">Open Match</a> ·{" "}
        <a href="/match/recovery">Open Recovery</a> ·{" "}
        <a href="/docs/testnet">Testnet networks and faucet</a>
      </p>
    </>
  );
}
