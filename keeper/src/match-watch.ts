import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address } from "viem";
import { elysiumTestnet } from "./chain.ts";

/**
 * Read-only Match health check. It does not sign and it does not read a private key.
 * Alerts use the same Telegram and webhook variables as the keeper watcher.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const statePath = resolve(root, "keeper/.match-watch-state.json");
const ZERO = "0x0000000000000000000000000000000000000000";
const WARN_SECONDS = BigInt(process.env.SHIFT_MATCH_WARN_SECONDS ?? "300");
const REMIND_MINUTES = Number(process.env.SHIFT_REMIND_MINUTES ?? "60");
const RPC_FAILS = Number(process.env.SHIFT_RPC_FAILS ?? "3");

const elysiumAbi = [
  { type: "function", name: "nextReserveId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reservedLiabilities", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "reserves",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { type: "uint256" },
      { type: "address" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "uint64" },
      { type: "uint64" },
      { type: "uint8" },
    ],
  },
] as const;

const hyperAbi = [
  {
    type: "function",
    name: "locks",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "uint64" },
      { type: "uint8" },
    ],
  },
] as const;

const RESERVED = 1;
const COMMITTED = 2;
const LOCKED = 1;

export type Check = { key: string; ok: boolean; message: string };

type Reserve = { id: bigint; status: number; deadline: bigint; hyperTimeout: bigint };
type Lock = { id: bigint; status: number; hyperTimeout: bigint };

export function matchChecks(input: {
  now: bigint;
  balance: bigint;
  liabilities: bigint;
  reserves: Reserve[];
  locks: Lock[];
  warnSeconds?: bigint;
}): Check[] {
  const warn = input.warnSeconds ?? WARN_SECONDS;
  const near = input.reserves.filter(
    (reserve) =>
      (reserve.status === RESERVED || reserve.status === COMMITTED) &&
      reserve.deadline > input.now &&
      reserve.deadline - input.now <= warn,
  );
  const unrevealed = input.locks.filter(
    (lock) => lock.status === LOCKED && lock.hyperTimeout > input.now && lock.hyperTimeout - input.now <= warn,
  );
  const backed = input.balance >= input.liabilities;
  return [
    {
      key: "timeout",
      ok: near.length === 0,
      message: `Shift Match: ${near.length} reserve(s) end within ${warn}s and are not released.`,
    },
    {
      key: "secret",
      ok: unrevealed.length === 0,
      message: `Shift Match: ${unrevealed.length} HyperEVM lock(s) still wait for the secret inside ${warn}s of timeout.`,
    },
    {
      key: "fallback",
      ok: backed,
      message: `Shift Match: contract balance ${input.balance} is below reserved liabilities ${input.liabilities}. A fallback moved reserved HYPE.`,
    },
  ];
}

const labels: Record<string, string> = {
  timeout: "reserves are outside the warning window",
  secret: "locked payments have a revealed secret or time left",
  fallback: "reserved HYPE is still in the escrow",
  rpc: "the Match contracts are readable",
};

type State = Record<string, { ok: boolean; alertedAt: number; fails?: number }>;

function loadState(): State {
  if (!existsSync(statePath)) return {};
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as State;
  } catch {
    return {};
  }
}

function loadMatch(): { elysiumMatch: Address; hyperMatch: Address } {
  const file = JSON.parse(readFileSync(resolve(root, "deployments/match.json"), "utf8")) as {
    elysiumMatch: Address;
    hyperMatch: Address;
  };
  return file;
}

async function send(text: string) {
  console.log(text);
  const token = process.env.SHIFT_TELEGRAM_TOKEN;
  const chat = process.env.SHIFT_TELEGRAM_CHAT_ID;
  const webhook = process.env.SHIFT_ALERT_WEBHOOK;
  const posts: Promise<unknown>[] = [];
  if (token && chat) {
    posts.push(
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      }),
    );
  }
  if (webhook) {
    posts.push(
      fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, content: text }),
      }),
    );
  }
  await Promise.allSettled(posts);
}

function selfTest() {
  const now = 1_000_000n;
  const healthy = matchChecks({
    now,
    balance: 10n,
    liabilities: 10n,
    reserves: [{ id: 1n, status: COMMITTED, deadline: now + 10_000n, hyperTimeout: now + 1_000n }],
    locks: [{ id: 1n, status: 2, hyperTimeout: now + 1_000n }],
  });
  const unhealthy = matchChecks({
    now,
    balance: 1n,
    liabilities: 10n,
    reserves: [{ id: 1n, status: RESERVED, deadline: now + 60n, hyperTimeout: 0n }],
    locks: [{ id: 1n, status: LOCKED, hyperTimeout: now + 60n }],
    warnSeconds: 300n,
  });
  if (healthy.some((check) => !check.ok)) throw new Error("healthy fixture alerted");
  if (unhealthy.some((check) => check.ok)) throw new Error("unhealthy fixture stayed quiet");
  console.log("match-watch self-test passed");
}

async function readChecks(): Promise<Check[]> {
  const { elysiumMatch, hyperMatch } = loadMatch();
  const elysium = createPublicClient({
    chain: elysiumTestnet,
    transport: http(process.env.SHIFT_MATCH_ELYSIUM_RPC ?? elysiumTestnet.rpcUrls.default.http[0], {
      retryCount: 3,
      retryDelay: 2_000,
    }),
  });
  const hyper = createPublicClient({
    transport: http(process.env.SHIFT_MATCH_HYPER_RPC ?? "https://rpc.hyperliquid-testnet.xyz/evm", {
      retryCount: 3,
      retryDelay: 2_000,
    }),
  });
  const [next, liabilities, balance, block] = await Promise.all([
    elysium.readContract({ address: elysiumMatch, abi: elysiumAbi, functionName: "nextReserveId" }),
    elysium.readContract({ address: elysiumMatch, abi: elysiumAbi, functionName: "reservedLiabilities" }),
    elysium.getBalance({ address: elysiumMatch }),
    elysium.getBlock(),
  ]);
  const reserves: Reserve[] = [];
  const locks: Lock[] = [];
  for (let id = 1n; id < next; id++) {
    const reserve = await elysium.readContract({
      address: elysiumMatch,
      abi: elysiumAbi,
      functionName: "reserves",
      args: [id],
    });
    reserves.push({ id, status: reserve[6], deadline: reserve[4], hyperTimeout: reserve[5] });
    const lock = await hyper.readContract({ address: hyperMatch, abi: hyperAbi, functionName: "locks", args: [id] });
    if (lock[6] !== 0) locks.push({ id, status: lock[6], hyperTimeout: lock[5] });
  }
  return matchChecks({ now: block.timestamp, balance, liabilities, reserves, locks });
}

async function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const { elysiumMatch, hyperMatch } = loadMatch();
  if (elysiumMatch === ZERO || hyperMatch === ZERO) {
    console.log("match contracts are not deployed; no checks");
    return;
  }
  const state = loadState();
  const now = Date.now();
  let checks: Check[];
  try {
    checks = await readChecks();
  } catch (error) {
    const fails = (state.rpc?.fails ?? 0) + 1;
    state.rpc = { ok: state.rpc?.ok ?? true, alertedAt: state.rpc?.alertedAt ?? 0, fails };
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    if (fails < RPC_FAILS) {
      console.log(`rpc read failed (${fails}/${RPC_FAILS}), not alerting yet`);
      return;
    }
    checks = [
      {
        key: "rpc",
        ok: false,
        message: `Shift Match watch: could not read the contracts for ${fails} checks in a row.`,
      },
    ];
  }
  if (!checks.some((check) => check.key === "rpc")) checks.push({ key: "rpc", ok: true, message: "" });
  for (const check of checks) {
    const previous = state[check.key];
    if (!check.ok) {
      const due = !previous || previous.ok || now - previous.alertedAt >= REMIND_MINUTES * 60_000;
      if (due) {
        await send(check.message);
        state[check.key] = { ok: false, alertedAt: now, fails: previous?.fails };
      }
    } else if (previous && !previous.ok) {
      await send(`Shift Match resolved: ${labels[check.key] ?? check.key}.`);
      state[check.key] = { ok: true, alertedAt: previous.alertedAt, fails: 0 };
    } else {
      state[check.key] = { ok: true, alertedAt: previous?.alertedAt ?? 0, fails: 0 };
    }
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  const bad = checks.filter((check) => !check.ok).map((check) => check.key);
  console.log(bad.length ? `unhealthy: ${bad.join(", ")}` : "healthy");
}

main();
