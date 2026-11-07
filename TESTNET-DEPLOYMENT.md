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
