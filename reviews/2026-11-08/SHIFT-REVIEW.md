# Shift review and maturity roadmap — 8 November 2026

Baseline: `6f0b20f` plus the user's existing uncommitted change to `deployments/route-browser-evidence.json`. Reviewed both the earlier implementation and Cursor's subsequent signed-live-card, quote-age and stable-host changes. This is an internal source review and local test exercise, not an independent audit. No runtime, deployed contract, public DNS or remote service was changed by this review. New files are diagnostic tests and this report.

## Verdict

The testnet implementation demonstrates the core idea, but passing happy-path trials does not establish production safety. I would keep public-funds mainnet deployment gated on the settlement architecture decision and the P1 fixes below. Several findings are in code I originally wrote; they are not all regressions introduced by Cursor.

## Checks completed now

- Existing contract suites: 93 test executions passed (includes inherited duplicate executions).
- Existing route-book suite: nine tests passed; pricing suite: ten assertions passed.
- Web production build and keeper typecheck passed. Build still warns about a roughly 676 kB minified entry bundle.
- New diagnostics: three Foundry scenarios and two TypeScript probes passed. These assert that the risky current behavior exists; their passing is not a security sign-off.
- Read-only public checks: both `https://www.shifthl.xyz/route-api/health` and `https://routes.shifthl.xyz/route-api/health` returned HTTP 200. The first reported chain 99801 and signedQuotes true. That is testnet, not a verified mainnet deployment.
- Vercel now rewrites to the stable hostname. The earlier temporary trycloudflare URL is no longer in this configuration.
- Did not SSH to Oracle, inspect server secrets, restart production, perform a new real-funds trade, or verify a reboot/restart of the tunnel. Health true does not prove an executor is running or a quote can execute.

## Findings, ordered by priority

### F1 — P1: a valid wrapped claim can stop the global claim indexer

Sources: `keeper/src/match-runtime.ts:128-133`, `contracts/src/DestMatch.sol:108`.

The destination permits anyone to call claim. The executor reads the Claimed log, retrieves the top-level transaction input and unconditionally decodes it as DestMatch calldata. A smart wallet/helper can call claim internally; the real destination log is valid, but the outer calldata belongs to the helper. Decoding throws before the scan checkpoint advances, so each later execution encounters the same transaction and fails again. The poisoning event need not belong to a SourceMatch fill: DestMatch can accept an independently funded lock. This makes the global failure more than an uncommon wallet-compatibility issue.

Evidence: `testReview_ClaimViaForwarderEmitsRealDestinationClaim` plus the wrapped-calldata TypeScript probe. This reproduces the contract and decoder assumptions locally; it is not a live-network attack.

Required change: make one malformed/unrecognized transaction unable to abort the batch. For reliable wrapped-call support, include the now-public secret in a destination claim event in a new contract version, verify its hash against the source fill and correlate it with the confirmed claim. Merely catching and skipping the event avoids global stoppage but still leaves that fill needing manual recovery. Test Safe/multicall/router calls, unrelated destination locks, duplicates, reorgs and recovery after an indexer restart.

### F2 — P1 / architecture gate: source refunds cannot know that destination already paid

Sources: `contracts/src/SourceMatch.sol:301-344`, `contracts/src/DestMatch.sol:108-117`.

A destination claim can succeed before its deadline. If source settlement cannot land before the later source timeout, source refund returns USDC to the exit and WHYPE to the LP even though the exit has already received destination HYPE. The depositor loses its HyperEVM payment and gets no Elysium HYPE. Two-hour spacing and monitoring reduce probability; they do not make this state impossible or provide cryptographic cross-chain finality.

Evidence: `testReview_ClaimedDestinationCanStillRefundSourceAfterOutage` reproduces exactly this terminal state.

Required decision: explicitly choose the trust/finality model before accepting public funds. Options include a verified cross-chain claim/finality mechanism or a clearly disclosed, reviewed attestation/resolution design. Both have cost and failure assumptions. A longer timeout or an extra keeper alone is not a complete fix. Until reviewed, use testnet or an explicitly capped controlled pilot with documented loss allocation and an incident process; caps do not repair the underlying property.

### F3 — P1: Recovery allows source settlement before destination funding/claim

Sources: `apps/web/src/Match.tsx:995-1033` and `:1138`.

The Finish Elysium settlement button is enabled based on source Funded status only. The settlement function does not check confirmed destination Claimed state before publishing the user's secret. SourceMatch accepts the valid preimage without checking the other chain. An exit following this ordinary UI action too early can pay USDC without having received HyperEVM HYPE.

Evidence: `testReview_SourceCanSettleWithoutAnyDestinationLock` proves source settlement succeeds without a destination lock at all. This is a UI safety failure layered on the contract's disclosed inability to observe the other chain, not an arbitrary outsider learning a private secret.

Required change: gate the button and handler on the exact, confirmed destination claim, matching fill/recipient/amount/hash; recheck immediately before submission. Also warn and block source refund in the UI when destination is already claimed. UI checks protect normal use but do not solve F2 or replace contract-level safety.

### F4 — P1 operational prerequisite: quote signer shares the owner identity

Sources: `deployments/signed-desk.json`, `contracts/src/SignedPosition.sol:23-40`, `keeper/src/signed-quotes.ts`.

The configured testnet Signed Desk owner and quote signer are the same submitted wallet. The quote service needs the corresponding private key to issue quotes. If that same setup is carried to production, compromising the online quote key also compromises owner privileges and withdrawals. This is a configuration risk inferred from the checked-in deployment and signer design; no private key was inspected or exposed.

Required change: keep Arash's submitted identity/owner as intended, but delegate a distinct online quote-only signer before production. Protect owner authority offline or with a suitable multisig; keep executor gas keys separate. Rehearse signer rotation, epoch invalidation, service outage and owner recovery. Quote-only signing still carries mispricing risk, so add exposure limits and independent price/depth checks.

### F5 — P2: expired offers permanently consume the 5,000-entry book limit

Source: `keeper/src/route-book.ts:101-102` and `sync()`.

The limit counts all stored offers. Expired/cancelled offers are not removed or archived. At 5,000 historical offers new offers are rejected even if none are active. This can be reached through normal use; per-wallet active limits do not fix lifetime accumulation.

Evidence: the expired-offer TypeScript probe creates 5,000 expired entries and confirms a valid new signed offer is rejected.

Required change: distinguish active capacity from retained history, prune/archive safely while preserving referenced route evidence, and retain replay nonces only through a bounded policy that cannot re-enable valid authorizations. Add storage migration/versioning, restore tests and a transactional database before multiple writers or materially higher traffic.

### F6 — P2: proxy IP limiting and unbounded shared work queues can take discovery offline

Sources: `keeper/src/route-server.ts:30-40,272-280,299-305` and `keeper/src/route-book.ts:81-96`.

Rate limiting keys on the immediate socket peer. Behind a local tunnel/reverse proxy, many users can share one socket IP; 300 requests/minute becomes a shared limit. Meanwhile each public book read queues a complete sync, including serial chain reads and a synchronous disk write. Unauthenticated quote requests also enqueue several paced RPC reads. There is no bounded queue/backpressure or separate budget for critical settlement/recovery work.

Required change: set an explicit trusted-proxy boundary, authenticate origin traffic where appropriate, and derive client identity only from headers that boundary overwrites/validates. Do not blindly trust arbitrary X-Forwarded-For. Cache/single-flight book synchronization, separate snapshots from mutation persistence, bound queues and per-wallet/IP work, and protect settlement from public discovery traffic. Load-test through the actual Vercel/tunnel path, not only localhost.

### F7 — P2: the live-card swap obtains a 15-second quote before token approval

Sources: `apps/web/src/LivePosition.tsx:309-324,223-249`.

Cursor moved the live card to Signed Desk, which removes its need for recurring keeper posts. But approveAndSwap fetches the signed quote before it waits for the allowance check, wallet approval, approval receipt and an extra refresh/log scan. A normal first-time approval can consume the 15-second lifetime. The user then attempts an expired swap. The write helper also does not inspect receipt.status before displaying confirmed.

Required change: complete approval first, then fetch and validate a new quote immediately before the swap, using the signed mid for a clearly displayed max-cost calculation. Never lengthen freshness merely to hide UX delays. Check receipt.status and simulate/recheck freshness; disable duplicate actions. SignedDeskPanel and LivePosition currently operate on the same signed address through two UI implementations; consolidate them to avoid behavioral divergence.

### F8 — P2: recovery lag grows with historical activity

Sources: `keeper/src/match-runtime.ts:84-97,125-138`, `keeper/src/match-execute.ts:24-44`, `apps/web/src/LivePosition.tsx:165-209`.

readFills rereads every historical fill and lock in an unbounded Promise.all; failure of one old request can prevent processing current settlement work. Claim backfills deliberately throttle 50-block windows, so cold rebuilds can take substantial time relative to the timeout. The live card also rescans quote events every four seconds. These are acceptable demo shortcuts but become RPC/availability risks as history grows.

Required change: persist active-vs-terminal state, use bounded concurrency and separate per-fill error handling, prioritize claimed-but-unsettled fills before background backfill, and measure worst-case restart lag against remaining deadlines. Persist compact event-derived metadata rather than having every browser scan deployment history. Reorg handling must revalidate the necessary finality window, including secret availability.

### F9 — P2 commercial gap: automatic routes do not reimburse executor gas

Sources: `keeper/src/route-book.ts:234-235`, `keeper/src/route-server.ts:203-204`, `keeper/src/match-execute.ts`.

Automatic routes set both gas allowances to zero; the server also enforces zero. Settlement/delivery gas is therefore paid by the executor without reimbursement from those fills. Off-chain discovery and signatures themselves cost no chain gas, but operating fills is not zero-cost to the team.

Required change: add measured, explicitly accepted reimbursement/caps with minimum viable order sizes, retry/revert budgets, gas-wallet alerts and separate presentation of LP spread, depositor incentive, protocol fee and execution cost. Do not advertise a fixed 0.1 HYPE/month budget without actual measurements. Avoid a fixed allowance that can silently absorb the depositor's entire incentive during congestion.

### F10 — P2 observability: health true is process health, not execution readiness

Source: `keeper/src/route-server.ts:281-289` and `keeper/src/watch.ts:signedChecks`.

signedQuotes is currently !!SHIFT_QUOTE_KEY. A present but wrong signer key, wrong network, inaccessible RPC or stopped executor can coexist with this value. The live endpoint's 200 is useful, but cannot certify the whole product.

Required change: separate liveness and readiness; cache checks of chain ID, executable deployment/config, signer match/epoch, read freshness, indexer lag, oldest unprocessed claim, executor balance and last successful settlement. Expose sanitized status and alert on deadlines/lag, not only process uptime. Do not generate paid test transactions in a health endpoint.

## Improvements already made by Cursor that are useful

- Stable route hostname now resolves through both tested paths; still rehearse tunnel restart/Oracle reboot before relying on it.
- Live WHYPE card now calls signed actions, so it no longer needs the old posted book for swaps.
- Showing the age of the stored mid is useful, but it is currently labelled Book age. Distinguish stored-mid age, current market-feed age and executable signature expiry. An old stored mid is not itself a valid signed quote.
- Existing isolated LP accounting, full-term Match signatures, nonce/epoch protections, secret kept out of public cards and original-asset refund tests remain valuable foundations.

## Roadmap: make Shift useful to Elysium rather than add more surface area

### Gate A — safety and reliable execution

Resolve F1/F2/F3, separate signing authority, fix expired-offer capacity and traffic isolation, fix first-swap approval UX. Add adversarial integration tests: outage across a timeout; failed/reorged destination claim; wrapped calls; executor offline/restart; corrupted cache/restore; nonce changes; slow wallet approvals and concurrent searches. Independent review should focus first on settlement/refund accounting and signer authority. Exit criterion: an agreed trust model plus successful failure/recovery drills, not merely a count of passing tests.

### Gate B — a constrained, measured liquidity pilot

Use one committed LP and one app/community channel supplying inbound HYPE; set per-fill and total exposure caps. Define who pays gas, maintains inventory and responds to an incident. Run external-user trials and measure fill success, quoted-vs-received HYPE, time to match/settle, expired requests, gas per successful fill including retries, LP inventory PnL, protocol net margin, and repeat usage. Publish demo/team volume separately from organic demand. No liquidity means no route; automated search does not create capital or guarantee fills.

### Gate C — make Route Quote a reusable ecosystem service

Ship a versioned quote/intent/settlement API and small SDK that wallets/apps can integrate. Return source/destination chain IDs, exact assets, net output, all costs, validity, fillability, trust assumptions and recovery state. Provide signed quote IDs, idempotent retries, structured errors, cancellable intents and documented lifecycle events. The useful promise is an executable conversion/exit route, not a guaranteed atomic one-transaction bridge. Strengthen the economic model before adding tokens or multi-LP complexity.

### Gate D — scale inventory and native HyperCore deliberately

After real pilot demand, add concurrent capacity reservations, partial fills and multiple LP routing with tested rounding/refund accounting. Current code reserves an entire LP position/depositor wallet for one route and does not implement a persistent auto-retrying exit queue; describe it as single-route discovery with LP approval. Add a policy-limited automated Match quote signer only after the manual flow is safe. Consider two-sided inventory replenishment or explicit LP rebalance tools before claiming sustainable passive LP yield.

When native HyperCore support is actually available and validated, add a separately reviewed trade-only hedge module with account permissions, intent/fill reconciliation, exposure limits and failed-hedge handling. Keep spot conversion, two-chain Match and hedge accounting distinct. The current scripted Shift leg is not a hedge and does not become one merely because the network upgrade ships.

## Reproduce the local probes

```
forge test --offline --match-contract ReviewRisks --match-test testReview_ -vv
cd keeper
npx tsx --test src/review-risks.test.ts
```

These are diagnostic tests added during review. Because ReviewRisks inherits the existing CommunityMatch test harness, an unfiltered full run will also repeat inherited tests; do not confuse that with additional independent coverage. No issue above was silently fixed or marked production-safe by adding these probes.
