export type ReadyFacts = {
  chainId: number | null;
  signerMatches: boolean | null;
  bookAgeMs: number | null;
  indexerLagBlocks: bigint | null;
  executorAgeMs: number | null;
  pendingClaims: number | null;
  settlementSeen: boolean;
  lastSettlement: number | null;
  gasWei: bigint | null;
  executorMode: "live" | "dry-run" | "missing";
};

const BOOK_FRESH_MS = 15_000;
const EXECUTOR_FRESH_MS = 30_000;
const INDEXER_LAG_BLOCKS = 10_000n;
const LOW_GAS_WEI = 50_000_000_000_000_000n;

/// Gas balance is one check among the rest. A funded executor with a stale
/// heartbeat, a stale book, or an unseen settlement record is not ready.
export function judgeReadiness(facts: ReadyFacts) {
  const checks = {
    chain: facts.chainId === 99801,
    signer: facts.signerMatches === true,
    book: facts.bookAgeMs !== null && facts.bookAgeMs <= BOOK_FRESH_MS && facts.bookAgeMs >= -1000,
    indexer: facts.indexerLagBlocks !== null && facts.indexerLagBlocks <= INDEXER_LAG_BLOCKS,
    executor: facts.executorMode !== "missing" && facts.executorAgeMs !== null && facts.executorAgeMs <= EXECUTOR_FRESH_MS,
    pending: facts.pendingClaims !== null,
    settlement: facts.settlementSeen,
    gas: facts.executorMode !== "live" || (facts.gasWei !== null && facts.gasWei >= LOW_GAS_WEI),
  };
  const blocked = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  return { ready: blocked.length === 0, blocked, checks };
}
