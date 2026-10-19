# Shift

One liquidity provider, one position. The position quotes a demo base token against USDC on Elysium. `evaluate` either stays quoted at the new mid or pulls the quote when the mid moves more than 50 bps, or when book slippage for the position size is above 50 bps. A swap is accepted only while the position is quoted.

The HyperCore move is a scripted ledger. `shift` moves 25% of the Elysium base into that ledger, and `advanceScripted` walks it through in-transit, idle, and resting. The tokens stay in the position contract. This is not an order on HyperCore. `ElysiumCoreWriter` and the market-data precompile are not called.

The keeper posts the live HyperCore ETH book into `KeeperBook` every few seconds. That book is not the demo token's market. The position itself reads `ScriptedBook`, so Stay, Pull, and Shift can be fired on cue. A keeper snapshot older than 15 seconds reverts instead of returning the old price.

## Network

- Chain ID `99801`
- RPC `https://testnet-rpc.elysium.kinetiq.xyz`
- Explorer `https://elysium.kinetiq.xyz/testnet-explorer`
- Testnet HYPE faucet: `https://elysium.kinetiq.xyz/testnet-faucet`

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
