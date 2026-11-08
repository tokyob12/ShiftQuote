import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbi,
  type Hex,
} from "viem";

const claimAbi = parseAbi(["function claim(bytes32 fillId, bytes32 secret)"]);
const claimSelector = encodeFunctionData({
  abi: claimAbi,
  functionName: "claim",
  args: [("0x" + "00".repeat(32)) as Hex, ("0x" + "00".repeat(32)) as Hex],
}).slice(0, 10);

export type UnparsedClaim = {
  fillId: Hex;
  transactionHash: Hex;
  blockHash: Hex;
  block: string;
  reason: string;
};

export type ParsedClaim = { secret: Hex; block: string; blockHash: Hex };

export type ClaimIndex = {
  dest: string;
  through: string;
  hash: Hex | null;
  claims: Record<string, ParsedClaim>;
  unparsed: UnparsedClaim[];
};

export function secretHashOf(secret: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }], [secret]));
}

export function secretAccepted(secret: Hex, expectedHash: Hex): boolean {
  return secretHashOf(secret).toLowerCase() === expectedHash.toLowerCase();
}

/// Direct `claim`, or one inner call that still carries the claim selector.
/// A wrapper that only forwards raw arguments stays unparsed.
export function extractClaimSecret(
  data: Hex,
  fillId: Hex,
): { secret: Hex } | { reason: string } {
  const direct = decodeClaim(data, fillId);
  if (direct) return { secret: direct };
  const body = data.toLowerCase();
  const needle = claimSelector.slice(2);
  const secrets = new Set<string>();
  let from = 2;
  for (let found = 0; found < 4; found += 1) {
    const at = body.indexOf(needle, from);
    if (at < 0) break;
    const secret = decodeClaim(("0x" + body.slice(at, at + 8 + 128)) as Hex, fillId);
    if (secret) secrets.add(secret.toLowerCase());
    from = at + 8;
  }
  if (secrets.size === 1) return { secret: [...secrets][0] as Hex };
  if (secrets.size > 1) return { reason: "ambiguous one-layer claim" };
  return { reason: "calldata is not a direct or one-layer claim" };
}

function decodeClaim(data: Hex, fillId: Hex): Hex | null {
  try {
    const call = decodeFunctionData({ abi: claimAbi, data });
    if (call.functionName === "claim" && call.args[0].toLowerCase() === fillId.toLowerCase())
      return call.args[1];
  } catch {
    return null;
  }
  return null;
}

export function upsertUnparsed(index: ClaimIndex, item: UnparsedClaim) {
  index.unparsed = index.unparsed.filter(
    (row) =>
      row.transactionHash.toLowerCase() !== item.transactionHash.toLowerCase() ||
      row.fillId.toLowerCase() !== item.fillId.toLowerCase(),
  );
  index.unparsed.push(item);
}

export function rememberClaim(index: ClaimIndex, fillId: Hex, claim: ParsedClaim) {
  index.claims[fillId] = claim;
  index.unparsed = index.unparsed.filter((row) => row.fillId.toLowerCase() !== fillId.toLowerCase());
}

export function acceptCachedIndex(
  saved: ClaimIndex | null,
  safe: bigint,
  throughBlockHash: Hex | null,
): ClaimIndex | null {
  if (!saved?.unparsed || saved.through === undefined) return null;
  if (BigInt(saved.through) > safe) return null;
  if (saved.hash && throughBlockHash && saved.hash.toLowerCase() !== throughBlockHash.toLowerCase()) return null;
  return saved;
}

export function deadlineAlerts(
  unparsed: UnparsedClaim[],
  fills: { id: Hex; status: number; refundAfter: bigint }[],
  now: bigint,
  warnSeconds = 1800n,
): { fillId: Hex; message: string }[] {
  const due: { fillId: Hex; message: string }[] = [];
  for (const item of unparsed) {
    const fill = fills.find((row) => row.id.toLowerCase() === item.fillId.toLowerCase());
    if (!fill || fill.status !== 1 || fill.refundAfter - now > warnSeconds) continue;
    due.push({
      fillId: item.fillId,
      message: `Shift recovery: claim ${item.fillId} is still unparsed (${item.reason}) and the source refund opens at ${fill.refundAfter.toString()}. Transaction ${item.transactionHash}.`,
    });
  }
  return due;
}
