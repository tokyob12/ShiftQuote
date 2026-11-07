# Shift testnet release — Cursor deployment handoff

The current release contains the original Desk and the community LP + Match path. The original submitted wallet remains the Source administrator, seeded LP owner, quote signer and treasury.

Project wallet: `0x1329818d4a89a1ea42e9F78c84009A79b8F269f2`.

## Reuse the current deployment

Read `deployments/match.json` for SourceMatch, DestMatch, factory, seeded position, token addresses and indexing start blocks. The release uses Elysium testnet 99801 and HyperEVM testnet 998.

The deployed executable bytecode and destination binding were checked against the build by `keeper/src/match-record.ts`. Authority handoff was confirmed on-chain by `keeper/src/match-handoff.ts`. Existing older Match addresses have been superseded in the frontend configuration.

Routine frontend publishing uses these addresses. Deployment scripts are for a deliberate future contract release and require another configuration/evidence update.

## Build and check

From the repository root:

```bash
cd apps/web
npm ci
npm run build
cd ../../keeper
npm ci
npm run typecheck
npm run test:pricing
npm run match-execute -- --self-test
cd ..
$HOME/.foundry/bin/forge test --offline
```

The contract suite includes regression coverage for unregistered positions, signed deadlines and gas terms, secret reuse, destination binding, gas refund, inventory limits, ownership handoff, campaign limits and native settlement.

## Frontend publishing

Use the existing shifthl.xyz Vercel project, with root directory `apps/web`, build command `npm run build`, and output directory `dist`. The existing `vercel.json` supplies the SPA fallback and HyperCore reference proxy.

The site has Exit, Deposit, LP and Recovery routes plus updated documentation. Public request links carry a hash and trade terms. The exit user's secret is stored in its browser session and private recovery file.

Signing keys belong on the executor host or in their owner's wallet. The frontend build uses public addresses and RPC endpoints.

## Executor host

Deploy the whole repository revision, including `apps/web/src/matchAbi.ts`, `deployments/match.json` and `keeper`. Both workers consume the generated ABI and deployment configuration.

Install Node 22 and the keeper dependencies. The executor's `tsx` dependency is included in production dependencies.

Create `/etc/shift/match-relayer.env` with restricted permissions and configure:

```dotenv
SHIFT_RELAYER_KEY=<gas-limited Elysium testnet executor key>
SHIFT_RPC_URL=<Elysium testnet provider endpoint>
SHIFT_MATCH_HYPER_RPC=https://rpc.hyperliquid-testnet.xyz/evm
```

The gas wallet executes already authorized settlements and fixed-beneficiary deliveries. Fund it with a limited test HYPE balance. The project treasury and LP authority remain the submitted wallet above.

First run `npm run match-execute -- --once` and `npm run match-watch` in `keeper`. With the relayer key absent, the executor reports eligible work in dry-run mode.

Install `keeper/deploy/shift-match-execute.service` and enable it after adapting its user, repository path and npm path to the existing host. Reuse `shift-match-watch.service` and `shift-match-watch.timer` for checks. Set optional Telegram/webhook destinations in `/etc/shift/watch.env`.

The executor indexes confirmed claims, decodes the now-public preimage, settles the source and delivers native credits. Its HyperEVM queries use the documented 50-block window with backoff and checkpoints. Keep the `keeper/.match-index.json` and `keeper/.match-dest-index.json` cache files persistent across service restarts. The indexers verify checkpoint hashes and rebuild after a detected reorg.

Cold index rebuilds can take time. Track executor lag and pending source deadlines. A long Elysium outage after the destination claim remains a cross-chain timing risk.

## Evidence and acceptance

`deployments/testnet-evidence.json` contains actual testnet transaction hashes for successful destination payment, source settlement/native delivery and the separate deadline-based refund scenario. The refund trial checks that the full destination payment plus unused gas budget is returned, and that the exit's original USDC returns on Elysium.

`npm run test:browser` checks all 13 documentation pages and the five primary app routes on desktop/mobile. A local Vite server at port 5180 and an installed Chrome binary are required. Override `SHIFT_CHROME_BIN` for a different Chrome location. The optional `--live` mode uses the local ignored test-wallet key file and project signing wallet to run the UI flow. Generated test-wallet keys and private recovery files are ignored by git. The three-wallet UI settlement passed on 6 November 2026; its public fill ID is in `deployments/browser-evidence.json`. The separate smoke run passed all 18 routes at desktop and mobile widths.

`npm run test:e2e` performs testnet transactions and waits for the actual configured refund deadline. Load the local environment before running it. It consumes test HYPE and uses mock USDC.

After publishing, smoke-test all Match routes and `/docs/match`, import a fresh public request, verify the connected chain labels and compare the displayed contract addresses with `deployments/match.json`. Check executor and watcher logs after one coordinated trial.

## Product scope

This release supports coordinated testnet participants. Users arrange an LP and incoming depositor, then share public links. Automatic counterparty discovery and unattended LP quote generation are later product work.

Production rollout requires independent settlement review, production token verification, measured timeout/finality settings and exposure caps. Testnet activity remains separate from paid-customer validation.

## Latest local checks — 6 November 2026

- Web production build and keeper typecheck passed.
- All 85 contract test executions passed (including 10 inherited cases run a second time).
- All 10 pricing/budget assertions passed.
- Actual two-chain success, native delivery and deadline-based refunds passed.
- Actual three-wallet browser settlement passed without a secret in either public card.
- All 18 app/documentation routes passed desktop/mobile overflow checks.

Public frontend publishing and installation of the always-on executor/watcher are Cursor deployment steps, as requested. Local checks do not confirm the production host has been updated.

## Route Quote + automatic matching (7 November 2026)

The Match app now has a shared off-chain order book. LPs publish a 30-minute size/price policy, incoming depositors publish maximum payment and minimum receive ratio, and exits search with their USDC budget and minimum HyperEVM receipt. The service ranks compatible single-LP routes by exit receipt and checks live source inventory, signer, pause/limits and destination balance before selection. LPs still sign the complete existing v2 fill, and both users confirm the existing escrow transactions. Offers are indicative, not spending approvals or custody.

Run `npm run route-book` in `keeper`. Local Vite proxies `/route-api` to `127.0.0.1:8787`. Production `apps/web/vercel.json` expects `https://routes.shifthl.xyz/route-api`; provision that HTTPS hostname on the Oracle server or replace the rewrite with the actual service hostname before publishing. Until the service is reachable, the UI reports discovery offline and keeps manual matching available.

Install `keeper/deploy/shift-route-book.service`, adapting the user and paths to the existing Oracle host. Put this configuration in `/etc/shift/route-book.env`:

```dotenv
SHIFT_ROUTE_HOST=127.0.0.1
SHIFT_ROUTE_PORT=8787
SHIFT_ROUTE_DATA=/var/lib/shift/route-book.json
SHIFT_RPC_URL=<Elysium testnet provider>
SHIFT_MATCH_HYPER_RPC=https://rpc.hyperliquid-testnet.xyz/evm
SHIFT_ROUTE_ORIGINS=https://shifthl.xyz,https://www.shifthl.xyz
```

Create `/var/lib/shift` owned by the service user, with mode 0700. The service writes one JSON database atomically and runs as a single process; keep persistent backups and do not run multiple writers. No wallet key is needed. Serve the process through the existing HTTPS reverse proxy:

```nginx
location /route-api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_read_timeout 120s;
    client_max_body_size 24k;
}
```

Health: `GET /route-api/health`. Discovery: `GET /route-api/book`. Wallet-authorized mutation: `POST /route-api/action`. Signatures bind action, canonical payload hash, wallet, nonce, expiry, source deployment and chain 99801. Accepted mutation nonces persist across restarts. Public requests contain hashes and terms; private recovery secrets never belong in this API.

A route holds an LP position and incoming wallet exclusively within this service. An unpublished hold expires after two minutes. A published request stays held through the full on-chain quote lifetime plus a one-minute buffer. Chain-funded routes stay held until actual source settlement/refund; RPC failure does not release capacity. This coordinates the local book and cannot prevent a participant trading elsewhere or spending its advertised balance. Source contracts remain the authority for actual inventory locks.

The first release publishes zero gas allowances. Each user pays its own wallet transaction gas, and the executor's gas is not reimbursed by these route quotes. This feature adds no periodic on-chain writes. Exact gas reimbursement and unattended quote signing are separate work; do not advertise this pilot as fully automatic settlement or zero-cost operation.

Check `npm run test:routes`, keeper typecheck, web build, and `npm run test:browser -- --live --routes` with the local test-wallet environment loaded. The last command spends small amounts of test HYPE and signs with the existing submitted LP wallet. Use only the testnet deployment. Existing escrow contracts, original submitted wallet and Desk demo are unchanged.

## Signed Desk: removing periodic keeper gas

`deployments/signed-desk.json` records the separate SignedPosition testnet deployment, with the original submitted wallet as owner and quote signer. Existing Desk contracts are not upgraded. PositionV2's source adds a virtual snapshot hook so SignedPosition reuses Stay/Pull, owner withdrawals and the scripted Shift ledger; deployed old bytecode is unaffected.

The `/desk` page includes Signed Desk controls. `POST /route-api/desk-quote` generates an on-demand EIP-712 quote from the HyperCore HYPE book. Quotes bind the requesting caller, action, exact size, price/slippage snapshot, contract, chain, signer epoch and unique nonce. Observed timestamp and validity are limited to 15 seconds; the contract rejects expired/replayed quotes and unsigned entry points. Quotes still trust the authorized price signer and require independent review before production.

For signed quote service, add `SHIFT_QUOTE_KEY` to the restricted route-book environment file. It must match the SignedPosition's `quoteSigner`. Use a separate quote-only signer for production and rotate it via the owner's `setQuoteSigner`; this also advances the epoch and invalidates old quotes. The testnet deployment currently uses the submitted wallet as explicitly requested. Never put this key in the frontend or public deployment configuration.

Set `SHIFT_KEEPER_MODE=offchain` on the legacy keeper and watcher only as part of an explicit cutover. In this mode the keeper sends no snapshot or evaluate transactions. Its old polling loop fetches market data only; it may also be stopped when only the on-demand route-book service is used. The watcher checks the quote-service health and HyperCore timestamp instead of requiring a posted snapshot or a funded legacy keeper. Set `SHIFT_ROUTE_URL=http://127.0.0.1:8787` for the watcher.

**Cutover order:** publish and verify the signed service; seed the separate signed position and verify signed swaps; use the original owner to close swaps on the legacy live-book position; migrate only unreserved Elysium inventory if intended; then switch/stop its posting keeper. Do not stop the old feed while advertising the old live position as active. The submitted scripted Desk demo remains independent.

This removes recurring keeper price-posting gas, not transaction gas. LP deposits/withdrawals, evaluate/requote/Shift actions, swaps, Match funding and settlement still cost gas. Off-chain discovery and quote signatures cost no chain gas. Neither change guarantees the shared RPC will never rate-limit; service reads are paced and a dedicated provider is recommended.

### Verified integration evidence

`deployments/route-browser-evidence.json` records the real browser flow through signed offer posting, automatic selection, LP inbox approval, Elysium funding, HyperEVM lock/claim and Elysium settlement. No public quote contained a recovery secret. `deployments/signed-desk-evidence.json` records actual signed seeding and a signed swap, exact WHYPE receipt and rejected replay simulation. The swap used 237,366 testnet gas units; this is not a prediction of mainnet dollar fees. Nine route-book regression tests, ten pricing assertions and all 93 contract test executions passed.

For local browser acceptance against a stable build, use `npm run preview -- --host 127.0.0.1 --port 5181` in `apps/web`, then `SHIFT_BROWSER_URL=http://127.0.0.1:5181 npm run test:browser -- --live --routes` in `keeper`. The live route test and the all-route smoke test are separate commands; the route test skips broad navigation so it does not flood the public RPC before wallet actions. Local 5181 is allowed by default; production should explicitly set its permitted origins.

`npm run test:signed-desk` runs the actual signed Desk trial with the ignored test-wallet file and submitted owner. It wraps 0.005 test HYPE and buys 0.001 WHYPE. It requires the local quote API configured with its signer. `npm run deploy:signed-desk` is a deliberate future redeployment command; routine publishing reuses current addresses.
