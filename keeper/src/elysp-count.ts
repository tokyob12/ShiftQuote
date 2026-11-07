import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reads ElysP's public escrow state. Shift does not call these contracts.
 * Offer state codes match the ElysP desk: 1 open, 2 filled, 3 cancelled.
 * Lock state codes match it too: 2 claimed, 3 expired.
 * A finished trade is stored on both chains, so the chain totals are not added.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "keeper/data/elysp-count.json");

const CONTRACTS = [
  { version: "v2", address: "0x724cdB8C588671189766f7B9Bad4C01cDcE2EB8a" },
  { version: "v1", address: "0xC67d480D450820Df408e7963945FaD18E2A090fC" },
] as const;

const CHAINS = [
  { name: "elysium", chainId: 99901, rpc: "https://rpc-live.elysp.com" },
  { name: "hyperevm", chainId: 999, rpc: "https://rpc.hyperliquid.xyz/evm" },
] as const;

const SELECTORS = {
  offerCount: "0x1115c24d",
  fillCount: "0x6051e4dc",
  lockCount: "0x9b10b6f5",
  getOffer: "0x4579268a",
  getFill: "0xd36177e2",
  getLock: "0xd68f4dd1",
} as const;

type Words = bigint[];

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  let last = "rpc failed";
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (response.status === 403 || response.status === 429 || response.status === 503) {
        last = `HTTP ${response.status}`;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 800 * (attempt + 1)));
        continue;
      }
      const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
      if (body.error) {
        const message = body.error.message ?? "rpc error";
        if (message.toLowerCase().includes("not ready") && attempt < 7) {
          last = message;
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 800 * (attempt + 1)));
          continue;
        }
        throw new Error(message);
      }
      return body.result;
    } catch (error) {
      if (error instanceof Error && !error.message.startsWith("HTTP") && !error.message.toLowerCase().includes("not ready")) {
        const message = error.message;
        if (message.includes("reverted") || message.includes("execution")) throw error;
        last = message;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 800 * (attempt + 1)));
        continue;
      }
      if (error instanceof Error && (error.message.startsWith("HTTP") || error.message.toLowerCase().includes("not ready"))) {
        throw error;
      }
      last = error instanceof Error ? error.message : String(error);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 800 * (attempt + 1)));
    }
  }
  throw new Error(last);
}

function wordsOf(hex: string): Words {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  const words: Words = [];
  for (let i = 0; i < body.length; i += 64) words.push(BigInt(`0x${body.slice(i, i + 64) || "0"}`));
  return words;
}

function asHex(n: number | bigint): string {
  return `0x${BigInt(n).toString(16).padStart(64, "0")}`;
}

async function call(url: string, to: string, data: string): Promise<Words> {
  const result = (await rpc(url, "eth_call", [{ to, data }, "latest"])) as string;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  return wordsOf(result);
}

async function countOrNull(url: string, to: string, data: string): Promise<number | null> {
  try {
    return Math.min(Number((await call(url, to, data))[0] ?? 0n), 500);
  } catch {
    return null;
  }
}

function hype(words: Words): bigint[] {
  return words.filter((word) => word >= 10n ** 14n && word < 10n ** 30n);
}

function addressOf(word: bigint): string | null {
  if (word <= 10n ** 30n || word >= 2n ** 160n) return null;
  return `0x${word.toString(16).padStart(40, "0")}`;
}

function timestamp(words: Words): number | null {
  const found = words.find((word) => word > 1_600_000_000n && word < 2_000_000_000n);
  return found === undefined ? null : Number(found);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function uint(data: string, n: number): string {
  return data + asHex(n).slice(2);
}

async function readSide(chain: (typeof CHAINS)[number], version: (typeof CONTRACTS)[number]) {
  const offerCount = await countOrNull(chain.rpc, version.address, SELECTORS.offerCount);
  const fillCount = await countOrNull(chain.rpc, version.address, SELECTORS.fillCount);
  const lockCount = await countOrNull(chain.rpc, version.address, SELECTORS.lockCount);
  if (offerCount === null && lockCount === null) {
    throw new Error("offer and lock views unavailable");
  }
  const counts = { offers: offerCount ?? 0, fills: fillCount ?? 0, locks: lockCount ?? 0 };
  const offers = [];
  for (let id = 0; id < counts.offers; id++) {
    if (id % 25 === 0) console.log(`  offers ${id}/${counts.offers}`);
    const words = await call(chain.rpc, version.address, uint(SELECTORS.getOffer, id));
    offers.push({ id, state: Number(words[2] ?? 0n), maker: addressOf(words[0] ?? 0n) });
  }
  const fills = [];
  for (let id = 0; id < counts.fills; id++) {
    const words = await call(chain.rpc, version.address, uint(SELECTORS.getFill, id));
    const amounts = hype(words);
    fills.push({
      id,
      offerId: Number(words[0] ?? 0n),
      taker: addressOf(words[1] ?? 0n),
      timestamp: timestamp(words),
      legs: amounts.map((amount) => amount.toString()),
      matched: (amounts.length ? amounts.reduce((max, amount) => (amount > max ? amount : max), 0n) : 0n).toString(),
    });
  }
  const locks = [];
  for (let id = 0; id < counts.locks; id++) {
    const words = await call(chain.rpc, version.address, uint(SELECTORS.getLock, id));
    const amounts = hype(words);
    locks.push({
      id,
      state: Number(words[2] ?? 0n),
      timestamp: timestamp(words),
      amount: (amounts[0] ?? 0n).toString(),
    });
  }
  const waits: number[] = [];
  for (const fill of fills) {
    if (fill.timestamp === null) continue;
    const deltas = locks
      .filter((lock) => lock.timestamp !== null && fill.legs.includes(lock.amount))
      .map((lock) => fill.timestamp! - (lock.timestamp ?? 0))
      .filter((delta) => delta >= 0 && delta <= 1800);
    if (deltas.length === 0) continue;
    waits.push(Math.min(...deltas));
  }
  const matched = fills.reduce((sum, fill) => sum + BigInt(fill.matched), 0n);
  const tally = (rows: { state: number }[]) =>
    rows.reduce<Record<string, number>>((countsByState, row) => {
      const key = String(row.state);
      countsByState[key] = (countsByState[key] ?? 0) + 1;
      return countsByState;
    }, {});
  return {
    chain: chain.name,
    chainId: chain.chainId,
    version: version.version,
    address: version.address,
    counts,
    matchedHypeWei: matched.toString(),
    offerStates: tally(offers),
    lockStates: tally(locks),
    cancelledOffers: offers.filter((offer) => offer.state === 3).length,
    expiredLocks: locks.filter((lock) => lock.state === 3).length,
    claimedLocks: locks.filter((lock) => lock.state === 2).length,
    openOffers: offers.filter((offer) => offer.state === 1).length,
    uniqueTakers: new Set(fills.map((fill) => fill.taker).filter(Boolean)).size,
    waitSeconds: {
      samples: waits.length,
      min: waits.length ? Math.min(...waits) : null,
      median: median(waits),
      max: waits.length ? Math.max(...waits) : null,
      windowSeconds: 1800,
    },
    fillView: fillCount !== null,
    fills,
  };
}

async function main() {
  const previous = existsSync(OUT)
    ? (JSON.parse(readFileSync(OUT, "utf8")) as { sides?: Array<{ chain: string; version: string; error?: string }> })
    : { sides: [] };
  const saved = new Map((previous.sides ?? []).filter((side) => !side.error).map((side) => [`${side.chain}:${side.version}`, side]));
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const sides = [];
  for (const chain of CHAINS) {
    for (const version of CONTRACTS) {
      const key = `${chain.name}:${version.version}`;
      if (saved.has(key) && !only.includes(key) && !process.argv.includes("--all")) {
        console.log(`keeping ${key}`);
        sides.push(saved.get(key));
        continue;
      }
      try {
        console.log(`reading ${key}`);
        sides.push(await readSide(chain, version));
      } catch (error) {
        sides.push({
          chain: chain.name,
          chainId: chain.chainId,
          version: version.version,
          address: version.address,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  const report = {
    readAt: new Date().toISOString(),
    note: "State codes are the ones the ElysP desk uses. Chain totals are separate because one trade is recorded on both chains. This count does not integrate Shift with ElysP.",
    sides,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  for (const side of sides) {
    if (!side) continue;
    if ("error" in side) {
      console.log(`${side.chain} ${side.version}: ${side.error}`);
      continue;
    }
    const row = side as Awaited<ReturnType<typeof readSide>>;
    console.log(
      `${row.chain} ${row.version}: fills ${row.counts.fills}, cancelled offers ${row.cancelledOffers}, expired locks ${row.expiredLocks}, wait median ${row.waitSeconds.median}s, matched wei ${row.matchedHypeWei}`,
    );
  }
  console.log(OUT);
}

main();
