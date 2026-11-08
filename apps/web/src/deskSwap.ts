export type SwapStep =
  | { action: "approve"; cap: bigint }
  | { action: "quote" }
  | { action: "review"; cap: bigint; payment: bigint }
  | { action: "swap"; cap: bigint }
  | { action: "halt"; reason: string };

export function impliedUsdc(size: bigint, bidX18: bigint, askX18: bigint): bigint {
  return (size * ((bidX18 + askX18) / 2n)) / 10n ** 30n;
}

/// Approval finishes before a quote is fetched. A later quote cannot raise `cap`
/// until the caller shows that price and the user agrees.
export function nextSwapStep(input: {
  allowance: bigint;
  cap: bigint;
  receipt: "none" | "success" | "reverted";
  quote: { payment: bigint; validUntil: number } | null;
  now: number;
}): SwapStep {
  if (input.receipt === "reverted")
    return { action: "halt", reason: "The transaction reverted. Review the price and try again." };
  if (input.allowance < input.cap) return { action: "approve", cap: input.cap };
  if (!input.quote || input.quote.validUntil <= input.now) return { action: "quote" };
  if (input.quote.payment > input.cap)
    return { action: "review", cap: input.cap, payment: input.quote.payment };
  return { action: "swap", cap: input.cap };
}
