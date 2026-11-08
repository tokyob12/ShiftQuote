import type { Hex } from "viem";

export const CONFIRMATION_DEPTH = 2n;

export type LockSnap = {
  recipient: string;
  payment: bigint;
  secretHash: Hex;
  status: number;
};

export type DestDecision =
  | { kind: "unconfirmed"; reason: string }
  | { kind: "locked" }
  | { kind: "claimed" }
  | { kind: "closed"; status: number };

const unread: DestDecision = {
  kind: "unconfirmed",
  reason: "HyperEVM read was not confirmed",
};

function same(left: LockSnap, right: LockSnap): boolean {
  return (
    left.recipient.toLowerCase() === right.recipient.toLowerCase() &&
    left.payment === right.payment &&
    left.secretHash.toLowerCase() === right.secretHash.toLowerCase() &&
    left.status === right.status
  );
}

/// Two agreeing reads are required. A failed or disagreeing read stays unconfirmed
/// and is not treated as "not claimed".
export function decideDestination(input: {
  expectedRecipient: string;
  expectedPayment: bigint;
  expectedSecretHash: Hex;
  first: LockSnap | null;
  second: LockSnap | null;
  tip: bigint | null;
  claim: { blockNumber: bigint; blockHash: Hex; canonicalHash: Hex | null } | null;
}): DestDecision {
  if (!input.first || !input.second || input.tip === null || !same(input.first, input.second)) return unread;
  const row = input.first;
  if (
    row.recipient.toLowerCase() !== input.expectedRecipient.toLowerCase() ||
    row.payment !== input.expectedPayment ||
    row.secretHash.toLowerCase() !== input.expectedSecretHash.toLowerCase()
  )
    return unread;
  if (row.status === 1) return { kind: "locked" };
  if (row.status !== 2) return { kind: "closed", status: row.status };
  const claim = input.claim;
  if (
    !claim ||
    claim.canonicalHash === null ||
    claim.canonicalHash.toLowerCase() !== claim.blockHash.toLowerCase() ||
    claim.blockNumber + CONFIRMATION_DEPTH > input.tip
  )
    return unread;
  return { kind: "claimed" };
}
