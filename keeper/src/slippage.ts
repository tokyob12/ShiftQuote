const ONE = 10n ** 18n;
const BPS = 10_000n;

export type Level = { px: string; sz: string; n?: number };

/** Parse a decimal string into 18-decimal fixed point. */
export function decimalToX18(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const raw = negative ? trimmed.slice(1) : trimmed;
  const [wholeRaw, fracRaw = ""] = raw.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const frac = (fracRaw + "0".repeat(18)).slice(0, 18);
  const parsed = BigInt(whole) * ONE + BigInt(frac);
  return negative ? -parsed : parsed;
}

/**
 * Walk the ask side for `sizeX18` of the coin.
 * Slippage is (average fill - mid) / mid, in bps.
 * If the visible book cannot fill the size, slippage is 10_000.
 */
export function quoteFromBook(levels: [Level[], Level[]], sizeX18 = ONE): {
  bidX18: bigint;
  askX18: bigint;
  midX18: bigint;
  slippageBps: bigint;
} {
  const [bids, asks] = levels;
  if (bids.length === 0 || asks.length === 0) {
    throw new Error("empty book");
  }
  const bidX18 = decimalToX18(bids[0].px);
  const askX18 = decimalToX18(asks[0].px);
  if (bidX18 <= 0n || askX18 < bidX18) {
    throw new Error("bad top of book");
  }
  const midX18 = (bidX18 + askX18) / 2n;

  let remaining = sizeX18;
  let notional = 0n;
  for (const level of asks) {
    if (remaining === 0n) break;
    const price = decimalToX18(level.px);
    const size = decimalToX18(level.sz);
    if (size <= 0n) continue;
    const take = size < remaining ? size : remaining;
    notional += (price * take) / ONE;
    remaining -= take;
  }

  const filled = sizeX18 - remaining;
  if (filled === 0n || midX18 === 0n || remaining > 0n) {
    return { bidX18, askX18, midX18, slippageBps: BPS };
  }
  const average = (notional * ONE) / filled;
  const slippageBps = average > midX18 ? ((average - midX18) * BPS) / midX18 : 0n;
  return { bidX18, askX18, midX18, slippageBps };
}
