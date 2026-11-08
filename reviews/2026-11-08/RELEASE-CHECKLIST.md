# Release checklist — open after Gate A

This pass makes the testnet path more stable. Public-pool mainnet stays a separate gate. These items stay open:

- F2. A destination claim can still be followed by a source refund if Elysium is down past `refundAfter`. The exit can hold the HyperEVM HYPE and also receive the USDC back. The depositor does not receive the Elysium payout. UI confirmation does not change this contract property.
- F4. The live quote signer is still the desk owner `0x1329818d4a89a1ea42e9F78c84009A79b8F269f2`. `setQuoteSigner` bumps `signerEpoch` and kills old quotes; that is covered by `testSetQuoteSignerBumpsEpochAndKillsOldQuote`. Rotating the live key is a separate operation: generate a quote-only key, call `setQuoteSigner` from the owner, put only that key in the route service, restart `shift-route-book`, and confirm an old signature is rejected. Do not reuse the owner key online.
- Gas reimbursement and revenue. Automatic routes still set both gas allowances to zero. The executor pays settlement gas. No fixed allowance is added here.

## Trusted proxy

Observed on 8 Nov 2026 through a browser request to `https://www.shifthl.xyz/route-api/health`. The origin peer was `127.0.0.1`. `cf-connecting-ip` was a Vercel egress address (`18.185.2.x`). `x-forwarded-for` and `x-vercel-forwarded-for` carried a different single address. Anyone who reaches the public tunnel can supply those forwarded headers, and this service does not verify Vercel’s proxy signature.

`SHIFT_TRUSTED_CLIENT_HEADER` stays unset. Public reads share one budget, and signed actions also have a per-wallet budget. The redacted sample stays in `keeper/.header-probe.json`.

## Signer rehearsal, not a live rotation

1. Generate a quote-only key. Keep the owner key offline.
2. From the owner, call `setQuoteSigner` on the signed desk. The epoch increases and every older quote dies.
3. Install only the quote-only key as `SHIFT_QUOTE_KEY` and restart the route service.
4. Readiness must show the signer check passing, without printing the key.
5. Confirm a quote from the previous key is rejected on chain.
