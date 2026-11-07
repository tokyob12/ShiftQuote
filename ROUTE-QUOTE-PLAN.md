# Shift Route Quote + automatic matching

## Scope

Add a shared off-chain order book to the existing testnet Match. Keep Desk and its submitted workflow, the submitted wallet, and deployed escrow contracts. One route uses one registered LP and one incoming depositor. Wallet confirmations remain mandatory; the service holds no keys or funds.

## Implementation checklist

- [x] Shared authenticated offers, durable matching reservations and validation.
- [x] HTTP service with on-chain inventory/balance checks and public request coordination.
- [x] Exit route search, depositor offers, LP policies and participant inbox in Match.
- [x] Regression tests for matching, replay, expiry, reservation contention and authorization.
- [x] Build, browser checks, documentation and Oracle/Cursor deployment handoff.

## Flow

1. LP signs an expiring indicative policy: position, USDC per HYPE and maximum size.
2. Depositor signs an expiring incoming offer: maximum HyperEVM HYPE and minimum Elysium HYPE per HYPE paid.
3. Exit signs a search with USDC budget and minimum destination HYPE. Server checks live registered inventory, signer, pause/limits and incoming balance, picks the best eligible complete route and holds both offers briefly.
4. Exit creates its private secret locally and publishes only the public full-term request. The LP sees it in the inbox, reviews it and signs the existing v2 fill.
5. Exit imports the signed quote and explicitly funds the existing SourceMatch. Depositor discovers the funded request in the inbox and explicitly locks HyperEVM HYPE. Existing claim, executor and recovery complete the trade.
6. Reservations are not custody. A signed request stays held through its source funding validity window. Chain-funded routes stay held until on-chain settlement or refund; an RPC failure never frees them.

## Boundaries

No guaranteed liquidity, no unsigned wallet mutations, no secret uploaded to the server, no automatic spending authority, no multi-LP splitting. Orders use wallet signatures bound to this deployment; server-side reservations coordinate its own book, while the contracts enforce actual custody and LP signatures. Competing activity outside this order book can invalidate indicative liquidity. Transaction gas and refund timing remain visible in Match. Off-chain service does not post periodic price updates.

## Operation

Run a single service process on Oracle behind HTTPS. Use a persistent private data directory and configured source/destination RPC providers. Frontend proxies /route-api to this host. Public frontend deployment stays with Cursor. Monitor service availability and RPC lag; manual public-card flow remains available if discovery is offline.

## Added scope: gas-free keeper price updates

- [x] SignedPosition reuses PositionV2 policy through a snapshot hook. Existing deployments remain unchanged.
- [x] Signed action binds caller, amount, action, chain, contract, 15-second lifetime, signer epoch and replay nonce.
- [x] Eight contract regression tests, including Stay/Pull/Shift and direct-call rejection.
- [x] Deployed separate testnet signed position with original submitted owner/signer; addresses in deployments/signed-desk.json.
- [x] On-demand quote endpoint and Signed Desk UI; legacy keeper offchain mode and matching watcher health mode.
- [x] Actual signed action test, final integration checks and Cursor cutover instructions.

The old live-book position still needs its old on-chain feed until explicitly retired. Switching service mode does not upgrade an existing contract. Cursor must close legacy swaps and perform an explicit inventory migration if desired before stopping its feed. Submitted scripted demo remains available.

## Verified results

- Nine matching regression tests and ten pricing assertions passed.
- 93 contract test executions passed, including eight new SignedPosition tests.
- Real browser automatic matching, LP approval, source funding, destination payment and source settlement passed; see deployments/route-browser-evidence.json.
- Real Signed Desk seed and swap passed without a snapshot-posting transaction; see deployments/signed-desk-evidence.json.
- Web build and keeper typecheck passed.
- Public publishing, HTTPS route hostname and Oracle service cutover remain deployment steps for Cursor, not local implementation gaps.
