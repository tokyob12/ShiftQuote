import { randomBytes } from "node:crypto";
import { isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sourceClient } from "./match-runtime.ts";
import {
  signedDeskAddress,
  signedDeskAbi,
  signedDeskTypes,
  type DeskQuote,
} from "../../apps/web/src/signedDesk.ts";
import { quoteFromBook, type Level } from "./slippage.ts";
export async function signedDeskQuote(
  payload: { caller: string; action: number; size: string },
  rpc = sourceClient,
) {
  if (!process.env.SHIFT_QUOTE_KEY || BigInt(signedDeskAddress) === 0n)
    throw Error("Signed Desk is not configured yet");
  if (
    !isAddress(payload.caller) ||
    ![1, 2, 3, 4, 5].includes(payload.action) ||
    !/^\d{1,36}$/.test(payload.size)
  )
    throw Error("Invalid quote request");
  const signer = privateKeyToAccount(process.env.SHIFT_QUOTE_KEY as Hex);
  const [configured, epoch, inventory, owner] = await Promise.all([
    rpc.readContract({
      address: signedDeskAddress,
      abi: signedDeskAbi,
      functionName: "quoteSigner",
    }),
    rpc.readContract({
      address: signedDeskAddress,
      abi: signedDeskAbi,
      functionName: "signerEpoch",
    }),
    rpc.readContract({
      address: signedDeskAddress,
      abi: signedDeskAbi,
      functionName: "elysiumBase",
    }),
    rpc.readContract({
      address: signedDeskAddress,
      abi: signedDeskAbi,
      functionName: "owner",
    }),
  ]);
  if (configured.toLowerCase() !== signer.address.toLowerCase())
    throw Error("Quote signer configuration mismatch");
  if (
    [2, 4, 5].includes(payload.action) &&
    payload.caller.toLowerCase() !== owner.toLowerCase()
  )
    throw Error("This action requires the LP owner");
  const size = payload.action <= 2 ? BigInt(payload.size) : inventory;
  if (size <= 0n || (payload.action === 1 && size > inventory))
    throw Error("Insufficient signed Desk inventory");
  const response = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "l2Book", coin: "@107" }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error("HyperCore reference unavailable");
  const book = (await response.json()) as {
    time: number;
    levels: [Level[], Level[]];
  };
  if (
    !Number.isSafeInteger(book.time) ||
    Date.now() - book.time > 8000 ||
    book.time > Date.now() + 1000
  )
    throw Error("Market reference is stale");
  const price = quoteFromBook(book.levels, size),
    observedAt = BigInt(Math.floor(book.time / 1000));
  const quote: DeskQuote = {
    action: payload.action,
    caller: payload.caller,
    size,
    bidX18: price.bidX18,
    askX18: price.askX18,
    slippageBps: price.slippageBps,
    coreHeight: BigInt(book.time),
    observedAt,
    validUntil: observedAt + 15n,
    epoch,
    nonce: `0x${randomBytes(32).toString("hex")}`,
  };
  const signature = await signer.signTypedData({
    domain: {
      name: "Shift Signed Desk",
      version: "1",
      chainId: 99801,
      verifyingContract: signedDeskAddress,
    },
    types: signedDeskTypes,
    primaryType: "Quote",
    message: quote,
  });
  return {
    position: signedDeskAddress,
    quote: Object.fromEntries(
      Object.entries(quote).map(([k, v]) => [k, String(v)]),
    ),
    signature,
  };
}
