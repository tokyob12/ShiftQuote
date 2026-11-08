import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { sourceAbi, destAbi } from "../../apps/web/src/matchAbi.ts";
import { elysiumTestnet, rpcUrl } from "./chain.ts";
import {
  acceptCachedIndex,
  deadlineAlerts,
  extractClaimSecret,
  rememberClaim,
  secretAccepted,
  upsertUnparsed,
  type ClaimIndex,
  type UnparsedClaim,
} from "./claim-queue.ts";

export { sourceAbi, destAbi };
export const root = fileURLToPath(new URL("../../", import.meta.url));
export const deployment = JSON.parse(
  readFileSync(root + "deployments/match.json", "utf8"),
);
export const sourceAddress = deployment.sourceMatch as Address;
export const destAddress = deployment.destMatch as Address;
export const sourceClient = createPublicClient({
  chain: elysiumTestnet,
  transport: http(rpcUrl),
});
export const destClient = createPublicClient({
  transport: http(
    process.env.SHIFT_MATCH_HYPER_RPC ??
      "https://rpc.hyperliquid-testnet.xyz/evm",
  ),
});
const cachePath = root + "keeper/.match-index.json";
const claimPath = root + "keeper/.match-dest-index.json";
const alertPath = root + "keeper/.match-claim-alerts.json";
type Index = {
  source: string;
  chain: number;
  through: string;
  hash: Hex | null;
  ids: Hex[];
  times: Record<string, number>;
};
export type FillReadError = { id: Hex; error: string };
export let fillReadErrors: FillReadError[] = [];
let latestClaims: ClaimIndex | null = null;

export function recoveryQueue(): UnparsedClaim[] {
  return readRecoveryQueue();
}

export function readRecoveryQueue(): UnparsedClaim[] {
  if (!existsSync(claimPath)) return latestClaims?.unparsed ?? [];
  try {
    const saved = JSON.parse(readFileSync(claimPath, "utf8")) as ClaimIndex;
    return saved.unparsed ?? [];
  } catch {
    return latestClaims?.unparsed ?? [];
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

export async function readFills() {
  const height = await sourceClient.getBlockNumber();
  const safe = height > 2n ? height - 2n : 0n;
  let cache: Index = {
    source: sourceAddress,
    chain: 99801,
    through: String(BigInt(deployment.sourceBlock ?? 0) - 1n),
    hash: null,
    ids: [],
    times: {},
  };
  if (existsSync(cachePath)) {
    const old = JSON.parse(readFileSync(cachePath, "utf8")) as Index;
    if (
      old.times &&
      old.source === sourceAddress &&
      old.chain === 99801 &&
      BigInt(old.through) <= safe
    ) {
      if (
        !old.hash ||
        (await sourceClient.getBlock({ blockNumber: BigInt(old.through) })).hash === old.hash
      )
        cache = old;
    }
  }
  for (let start = BigInt(cache.through) + 1n; start <= safe; start += 1000n) {
    const end = start + 999n < safe ? start + 999n : safe;
    const logs = await sourceClient.getContractEvents({
      address: sourceAddress,
      abi: sourceAbi,
      eventName: "Funded",
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs)
      if (log.args.fillId && !cache.ids.includes(log.args.fillId)) {
        cache.ids.push(log.args.fillId);
        cache.times[log.args.fillId] = Number(
          (await sourceClient.getBlock({ blockNumber: log.blockNumber })).timestamp,
        );
      }
  }
  cache.through = String(safe);
  cache.hash = (await sourceClient.getBlock({ blockNumber: safe })).hash;
  saveIndex(cachePath, cache);
  const errors: FillReadError[] = [];
  const rows = await mapPool(cache.ids, 4, async (id) => {
    try {
      return {
        id,
        fundedAt: cache.times[id],
        fill: await sourceClient.readContract({
          address: sourceAddress,
          abi: sourceAbi,
          functionName: "getFill",
          args: [id],
        }),
        lock: await destClient.readContract({
          address: destAddress,
          abi: destAbi,
          functionName: "locks",
          args: [id],
        }),
      };
    } catch (error) {
      errors.push({ id, error: shortError(error) });
      return null;
    }
  });
  fillReadErrors = errors;
  if (errors.length) console.error("Fill reads skipped", errors.length);
  return rows.filter((row) => row !== null);
}
export function shortError(error: unknown) {
  return error instanceof Error
    ? error.message.split("\n")[0].slice(0, 180)
    : "operation failed";
}

async function retryRpc<T>(action: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 10000)));
    }
  }
}

async function classifyClaim(
  index: ClaimIndex,
  fillId: Hex,
  transactionHash: Hex,
  blockNumber: bigint,
  blockHash: Hex,
  input: Hex,
) {
  const extracted = extractClaimSecret(input, fillId);
  if ("reason" in extracted) {
    upsertUnparsed(index, {
      fillId,
      transactionHash,
      blockHash,
      block: String(blockNumber),
      reason: extracted.reason,
    });
    return;
  }
  let lock: readonly [Address, Address, bigint, bigint, Hex, bigint, number];
  let fill: { secretHash: Hex; status: number };
  let canonical: Hex | null;
  try {
    [lock, fill, canonical] = await Promise.all([
      retryRpc(() =>
        destClient.readContract({
          address: destAddress,
          abi: destAbi,
          functionName: "locks",
          args: [fillId],
        }),
      ) as Promise<readonly [Address, Address, bigint, bigint, Hex, bigint, number]>,
      retryRpc(() =>
        sourceClient.readContract({
          address: sourceAddress,
          abi: sourceAbi,
          functionName: "getFill",
          args: [fillId],
        }),
      ),
      retryRpc(() => destClient.getBlock({ blockNumber }).then((block) => block.hash)),
    ]);
  } catch (error) {
    throw new Error(`claim verification unavailable: ${shortError(error)}`);
  }
  const secret = extracted.secret;
  const reason =
    Number(fill.status) === 0
      ? "no matching source fill"
      : Number(lock[6]) !== 2 || canonical === null || canonical.toLowerCase() !== blockHash.toLowerCase()
        ? "destination claim is not confirmed"
        : !secretAccepted(secret, lock[4]) || !secretAccepted(secret, fill.secretHash)
          ? "secret does not match the confirmed claim"
          : null;
  if (reason) {
    upsertUnparsed(index, {
      fillId,
      transactionHash,
      blockHash,
      block: String(blockNumber),
      reason,
    });
    return;
  }
  rememberClaim(index, fillId, { secret, block: String(blockNumber), blockHash });
}

async function refreshAlerts(index: ClaimIndex) {
  const now = (await sourceClient.getBlock()).timestamp;
  const fills: { id: Hex; status: number; refundAfter: bigint }[] = [];
  for (const item of index.unparsed) {
    try {
      const fill = await sourceClient.readContract({
        address: sourceAddress,
        abi: sourceAbi,
        functionName: "getFill",
        args: [item.fillId],
      });
      fills.push({ id: item.fillId, status: Number(fill.status), refundAfter: fill.refundAfter });
    } catch {
      /* The next pass retries the deadline read. */
    }
  }
  const due = deadlineAlerts(index.unparsed, fills, now);
  saveIndex(alertPath, due);
  for (const item of due) console.error(item.message);
}

export async function readClaims() {
  const tip = await destClient.getBlockNumber();
  const safe = tip > 2n ? tip - 2n : 0n;
  let cache: ClaimIndex = {
    dest: destAddress,
    through: String(BigInt(deployment.destBlock) - 1n),
    hash: null,
    claims: {},
    unparsed: [],
  };
  if (existsSync(claimPath)) {
    const old = JSON.parse(readFileSync(claimPath, "utf8")) as ClaimIndex;
    const saved = old?.dest === destAddress ? { ...old, unparsed: old.unparsed ?? [] } : null;
    const throughHash =
      saved && BigInt(saved.through) >= 0n
        ? (await retryRpc(() => destClient.getBlock({ blockNumber: BigInt(saved.through) }))).hash
        : null;
    const accepted = acceptCachedIndex(saved, safe, throughHash);
    if (accepted) cache = accepted;
  }
  for (const item of [...cache.unparsed]) {
    const tx = await retryRpc(() => destClient.getTransaction({ hash: item.transactionHash }));
    const block = await retryRpc(() => destClient.getBlock({ blockNumber: BigInt(item.block) }));
    if (!block.hash || block.hash.toLowerCase() !== item.blockHash.toLowerCase()) {
      upsertUnparsed(cache, { ...item, reason: "block is no longer canonical" });
      continue;
    }
    await classifyClaim(cache, item.fillId, item.transactionHash, BigInt(item.block), item.blockHash, tx.input);
  }
  for (let from = BigInt(cache.through) + 1n; from <= safe; from += 50n) {
    const to = from + 49n < safe ? from + 49n : safe;
    const logs = await retryRpc(() =>
      destClient.getContractEvents({
        address: destAddress,
        abi: destAbi,
        eventName: "Claimed",
        fromBlock: from,
        toBlock: to,
      }),
    );
    for (const log of logs) {
      if (!log.args.fillId || !log.transactionHash || log.blockNumber === null) continue;
      const tx = await retryRpc(() => destClient.getTransaction({ hash: log.transactionHash! }));
      const block = await retryRpc(() => destClient.getBlock({ blockNumber: log.blockNumber! }));
      if (!block.hash) continue;
      await classifyClaim(cache, log.args.fillId, log.transactionHash, log.blockNumber, block.hash, tx.input);
    }
    cache.through = String(to);
    cache.hash = (await retryRpc(() => destClient.getBlock({ blockNumber: to }))).hash;
    saveIndex(claimPath, cache);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  latestClaims = cache;
  await refreshAlerts(cache);
  saveIndex(claimPath, cache);
  return cache.claims;
}

function saveIndex(path: string, value: unknown) {
  const temporary = path + "." + process.pid + ".tmp";
  writeFileSync(temporary, JSON.stringify(value));
  renameSync(temporary, path);
}
