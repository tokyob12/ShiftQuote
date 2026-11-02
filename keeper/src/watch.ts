import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address } from "viem";
import { elysiumTestnet, rpcLabel, rpcUrl } from "./chain.ts";

/**
 * One-shot health check for the keeper, meant to run every minute from a timer.
 * It runs apart from the keeper, so a keeper that crashed or hangs is still caught.
 *
 * Alerts go to Telegram (SHIFT_TELEGRAM_TOKEN and SHIFT_TELEGRAM_CHAT_ID) and to any
 * webhook that takes a JSON text field, such as Discord or Slack (SHIFT_ALERT_WEBHOOK).
 * With neither set, alerts are only printed.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const statePath = resolve(root, "keeper/.watch-state.json");

const STALE_SECONDS = BigInt(process.env.SHIFT_STALE_SECONDS ?? "60");
const LOW_GAS_WEI = BigInt(Math.round(Number(process.env.SHIFT_LOW_GAS_HYPE ?? "0.1") * 1e18));
const REMIND_MINUTES = Number(process.env.SHIFT_REMIND_MINUTES ?? "60");
// The shared public RPC rate-limits now and then, so one failed read is not an outage.
const RPC_FAILS = Number(process.env.SHIFT_RPC_FAILS ?? "3");

const bookAbi = [
  { type: "function", name: "postedAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "keeper", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const positionAbi = [
  { type: "function", name: "location", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "elysiumBase", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "swapsOpen", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

type Check = { key: string; ok: boolean; message: string };

const labels: Record<string, string> = {
  book: "the keeper is posting the spot book",
  gas: "the keeper has enough HYPE",
  pulled: "the live position is Quoted",
  soldout: "the live position has WHYPE to sell",
  rpc: "the chain is readable",
};
type State = Record<string, { ok: boolean; alertedAt: number; fails?: number }>;

function loadV2(): { book: Address; position: Address } {
  const v2 = JSON.parse(readFileSync(resolve(root, "deployments/v2.json"), "utf8")) as {
    spotKeeperBook: Address;
    positionV2: Address;
  };
  return { book: v2.spotKeeperBook, position: v2.positionV2 };
}

function loadState(): State {
  if (!existsSync(statePath)) return {};
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as State;
  } catch {
    return {};
  }
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
  const results = await Promise.allSettled(posts);
  for (const result of results) {
    if (result.status === "rejected") console.error(`alert not delivered: ${result.reason}`);
  }
}

async function runChecks(): Promise<Check[]> {
  const { book, position } = loadV2();
  const client = createPublicClient({
    chain: elysiumTestnet,
    transport: http(rpcUrl, { retryCount: 3, retryDelay: 2_000 }),
  });
  const [block, postedAt, keeper, location, base, swapsOpen] = await Promise.all([
    client.getBlock(),
    client.readContract({ address: book, abi: bookAbi, functionName: "postedAt" }),
    client.readContract({ address: book, abi: bookAbi, functionName: "keeper" }),
    client.readContract({ address: position, abi: positionAbi, functionName: "location" }),
    client.readContract({ address: position, abi: positionAbi, functionName: "elysiumBase" }),
    client.readContract({ address: position, abi: positionAbi, functionName: "swapsOpen" }),
  ]);
  const age = block.timestamp > postedAt ? block.timestamp - postedAt : 0n;
  const gas = await client.getBalance({ address: keeper });
  const hype = (Number(gas) / 1e18).toFixed(4);

  return [
    {
      key: "book",
      ok: postedAt !== 0n && age <= STALE_SECONDS,
      message:
        postedAt === 0n
          ? "Shift keeper: the spot book has never been posted."
          : `Shift keeper: the spot book is ${age}s old (limit ${STALE_SECONDS}s). Swaps and evaluate revert until the keeper posts again.`,
    },
    {
      key: "gas",
      ok: gas >= LOW_GAS_WEI,
      message: `Shift keeper: ${keeper} holds ${hype} HYPE. Top it up from https://testnet.elysium.kinetiq.xyz/faucet before the keeper stops.`,
    },
    {
      key: "pulled",
      ok: location !== 2,
      message: "Shift: the live position is Pulled. If the book has settled away from the old mid, the owner can requote.",
    },
    {
      key: "soldout",
      ok: !(swapsOpen && base === 0n),
      message: "Shift: the live position has no WHYPE left while swaps are open. The owner can deposit more or close swaps.",
    },
  ];
}

/** viem errors carry the request body and docs links; keep the reason only. */
function shortError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const details = /Details: (.*)/.exec(error.message)?.[1];
  return (details ?? error.message.split("\n")[0]).slice(0, 200);
}

async function main() {
  const state = loadState();
  const now = Date.now();
  let checks: Check[];
  try {
    checks = await runChecks();
  } catch (error) {
    const fails = (state.rpc?.fails ?? 0) + 1;
    state.rpc = { ok: state.rpc?.ok ?? true, alertedAt: state.rpc?.alertedAt ?? 0, fails };
    if (fails < RPC_FAILS) {
      writeFileSync(statePath, JSON.stringify(state, null, 2));
      console.log(`rpc read failed (${fails}/${RPC_FAILS}), not alerting yet: ${shortError(error)}`);
      return;
    }
    checks = [
      {
        key: "rpc",
        ok: false,
        message: `Shift watch: could not read the chain through ${rpcLabel()} for ${fails} checks in a row: ${shortError(error)}`,
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
    } else {
      if (previous && !previous.ok) await send(`Shift resolved: ${labels[check.key] ?? check.key} again.`);
      state[check.key] = { ok: true, alertedAt: previous?.alertedAt ?? 0, fails: 0 };
    }
  }

  writeFileSync(statePath, JSON.stringify(state, null, 2));
  const bad = checks.filter((check) => !check.ok).map((check) => check.key);
  console.log(bad.length ? `unhealthy: ${bad.join(", ")}` : `healthy (${rpcLabel()})`);
}

main();
