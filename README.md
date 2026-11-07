# Shift

## Current Match testnet release

Shift combines a community LP's Elysium conversion quote with a depositor bringing HYPE from HyperEVM. An exit user reserves test mUSDC, the LP supplies WHYPE, and the depositor supplies HyperEVM HYPE. Settlement credits native HYPE payouts and USDC proceeds. Accepted deadlines govern the two refund paths.

The project wallet, Source admin, seeded LP owner, quote signer and treasury are `0x1329818d4a89a1ea42e9F78c84009A79b8F269f2`.

- Read [TESTNET-DEPLOYMENT.md](TESTNET-DEPLOYMENT.md) for Cursor's frontend and worker deployment steps.
- Read [deployments/match.json](deployments/match.json) for the current deployed addresses and indexing start blocks.
- Read [deployments/testnet-evidence.json](deployments/testnet-evidence.json) for the actual success/refund transaction evidence.
- Read [deployments/browser-evidence.json](deployments/browser-evidence.json) for the real three-wallet browser settlement fill ID.
- Open `/match`, `/match/deposit`, `/match/lp` and `/match/recovery` for the guided app.
- Open `/docs/match` for the user-facing guide.

Public request links contain trade terms, signatures and a secret hash. The exit user's preimage stays in its browser/private recovery file. The current pilot coordinates named participants.

## Original Desk reference

One liquidity provider, one position. The position quotes a demo base token against USDC on Elysium. `evaluate` either stays quoted at the new mid or pulls the quote when the mid moves more than 50 bps, or when book slippage for the position size is above 50 bps. A swap is accepted only while the position is quoted.

The HyperCore move is a scripted ledger. `shift` moves 25% of the Elysium base into that ledger, and `advanceScripted` walks it through in-transit, idle, and resting. The tokens stay in the position contract. This is not an order on HyperCore. `ElysiumCoreWriter` and the market-data precompile are not called.

The keeper posts the live HyperCore ETH book into `KeeperBook` every few seconds. That book is not the demo token's market. The position itself reads `ScriptedBook`, so Stay, Pull, and Shift can be fired on cue. A keeper snapshot older than 15 seconds reverts instead of returning the old price.

## Network

- Chain ID `99801`
- RPC `https://testnet-rpc.elysium.kinetiq.xyz`
- Explorer `https://testnet.elysium.kinetiq.xyz/explorer`
- Testnet HYPE faucet: `https://testnet.elysium.kinetiq.xyz/faucet`

Canonical testnet USDC (`0x7D29d8047B905000459c0E80c34a26CeedcB47b2`) is used only when the deployer already holds at least 1,000 of it. Otherwise the deploy mints `mUSDC` and the app labels it as a mock.

## Run

```bash
forge test
cd apps/web && npm install && npm run dev
cd keeper && npm install
SHIFT_PRIVATE_KEY=0x... npm start
```

`forge test` needs Foundry and `lib/forge-std` (`git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std`).

Deploy, then run the same path the tests cover, against testnet:

```bash
SHIFT_PRIVATE_KEY=0x... forge script contracts/script/Deploy.s.sol --rpc-url https://testnet-rpc.elysium.kinetiq.xyz --broadcast
cd keeper && SHIFT_PRIVATE_KEY=0x... npm run demo
```

The deploy writes `apps/web/src/deployments.ts`.

## Deployed addresses

Testnet deploy from `0x1329818d4a89a1ea42e9F78c84009A79b8F269f2`:

- Demo asset (SDA): `0x35578CA58726E86BbFa10526dd7D571923ddD3d9`
- Quote (mUSDC, mock): `0xf0A6345093eA6f04768B3CfeaBf50b65A9a3F0c9`
- Scripted book: `0x3E6E2654Fb3ea12c5772Cc35284C7e226160B7e8`
- Keeper book: `0x52F59Cb79042Dfe6Fe7f12826180318CBb0a283d`
- Position: `0x8e3dfb663603D5D21Bfd1BfE1BD470Da2b396815`

The position was deposited with 1,000 SDA and 1,000 mUSDC and started Quoted at 1 USDC. The HyperCore leg is scripted. Canonical testnet USDC was not used because this deployer held none.

## Original Desk live-book position

The Desk shows the submitted position and PositionV2. The separate Match routes use the newer source, destination and LP contracts listed above.

- Base is canonical WHYPE (`0xCD57F65c2B0e5881CFC2E609F7CD53b746E1F234`). Quote is the same mUSDC.
- The reader is a new `KeeperBook` that the keeper fills from HyperCore spot `@107` (HYPE/USDC), priced from the Hyperliquid mainnet book.
- `swap(baseOut, maxUsdcIn)` evaluates a fresh read first. Inside the band it moves the quote to that mid and sells. Outside the band, or above 50 bps slippage, the call reverts and the location stays as it was. `evaluate` is what records Pull. A stale snapshot reverts.
- `shift`, `advanceScripted`, and `returnScripted` run on the live reader. The leg is still a ledger inside the contract. The tokens stay in the contract. This is not an order on HyperCore.
- Swaps start closed. The owner opens and closes them with `setSwapsOpen`. Evaluate, preview, and the Shift legs run either way.
- The owner can `withdraw` from the Elysium base and quote while Quoted or Pulled. The transit, core idle, and resting balances are never touched.
- `requote` (owner only, from Pulled) moves the quote back to the mid of a fresh read. Pull keeps the old mid, so once the book settles more than 50 bps away, evaluate keeps answering Pull. Requote is the explicit way out. It reverts on a stale read or above 50 bps slippage. The current PositionV2 deployment includes requote; older deployment addresses are historical.

On the PositionV2 at `0x46093Bb711fD739386D24DE2172a59606040aEd7`, a stale quoted mid was walked from 78.58 to 81.83 on 21 October 2026, around 07:55 UTC. Swaps were closed from block 12681625 to 12681947, so nothing traded during the walk. Nine snapshots were posted by hand, starting at block 12681647. Each had the bid equal to the ask, 40 bps above the last, and those prices did not come from HyperCore. The tenth posted the live book once the gap was inside 50 bps, and evaluate in block 12681931 stored 81.8335. `requote` replaces that procedure.

```bash
SHIFT_PRIVATE_KEY=0x... forge script contracts/script/DeployV2.s.sol --rpc-url https://testnet-rpc.elysium.kinetiq.xyz --broadcast
cd keeper && SHIFT_PRIVATE_KEY=0x... npm start
SHIFT_PRIVATE_KEY=0x... SHIFT_V2_BASE=5000000000000000000 forge script contracts/script/SeedV2.s.sol --rpc-url https://testnet-rpc.elysium.kinetiq.xyz --broadcast
```

The deploy writes `deployments/v2.json`, not `apps/web/src/deployments.ts`. Once that file exists, the keeper posts the `@107` book. It posts the ETH book too only when `SHIFT_POST_ETH` is set. `SHIFT_SPOT_SIZE` sets the HYPE size used for the slippage walk (default 10). `SHIFT_RPC_URL` points the keeper at a provider endpoint such as Alchemy (`https://elysium-testnet.g.alchemy.com/v2/<key>`); Elysium asks for one for steady traffic, and the shared public RPC is only the fallback. The keeper logs the RPC host, never the key. SeedV2 reads the spot snapshot before any transaction and stops if there is none or it is older than 15 seconds. After seeding, open swaps with `setSwapsOpen(true)`.

## Keeper health alert

`npm run watch` in `keeper/` runs one check and exits. It runs apart from the keeper, so a keeper that crashed or hangs is still caught. It alerts when:

- the spot book is older than `SHIFT_STALE_SECONDS` (default 60),
- the keeper address holds less than `SHIFT_LOW_GAS_HYPE` (default 0.1),
- the live position is Pulled, or has no WHYPE left while swaps are open,
- the chain cannot be read for `SHIFT_RPC_FAILS` checks in a row (default 3). A single failed read is retried, then counted, and does not alert by itself.

Each problem is sent once, repeated every `SHIFT_REMIND_MINUTES` (default 60) while it lasts, and followed by a resolved message. Alerts go to Telegram with `SHIFT_TELEGRAM_TOKEN` and `SHIFT_TELEGRAM_CHAT_ID`, and to any Discord or Slack style webhook with `SHIFT_ALERT_WEBHOOK`. It needs no private key.

The unit runs as `ubuntu` in `/home/ubuntu/shift-keeper/keeper`, with `PATH` set to that user's Node install. Copy `keeper/deploy/shift-watch.service` and `shift-watch.timer` to `/etc/systemd/system/`, put the variables in `/etc/shift/watch.env`, then:

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now shift-watch.timer
```

## Verifying contracts

The explorer runs Blockscout and needs no API key. `contracts/script/verify.sh` verifies every live contract with `forge verify-contract`, reading each constructor argument back from the chain. `DRY_RUN=1` prints the commands without submitting. The first PositionV2 (`0x46093Bb7…`) is left out because it was built from a source before `requote`.

```bash
DRY_RUN=1 contracts/script/verify.sh
contracts/script/verify.sh
```
