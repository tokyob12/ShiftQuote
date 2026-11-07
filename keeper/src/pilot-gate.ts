import { readFileSync } from "node:fs";
import { readFills } from "./match-runtime.ts";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The 30-day pilot gate. Match stays a section of the site until every line passes.
 * A wallet's written yes is SHIFT_MATCH_WALLET_PILOT=1. The chain cannot show that.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const PILOT = {
  repeatAddresses: 5,
  fillsEach: 2,
  windowDays: 30,
};

export function evaluatePilot(input: {
  fillsByAddress: Record<string, number>;
  feeWei: bigint;
  walletPilot: boolean;
  matchIsHome: boolean;
}): { pass: boolean; lines: string[] } {
  const repeats = Object.values(input.fillsByAddress).filter(
    (fills) => fills >= PILOT.fillsEach,
  ).length;
  const lines = [
    `repeat users ${repeats}/${PILOT.repeatAddresses}`,
    `wallet pilot ${input.walletPilot ? "yes" : "no"}`,
    `fee wei ${input.feeWei.toString()}`,
    `homepage ${input.matchIsHome ? "match" : "landing"}`,
  ];
  const pass =
    repeats >= PILOT.repeatAddresses &&
    input.walletPilot &&
    input.feeWei > 0n &&
    !input.matchIsHome;
  return { pass, lines };
}

function selfTest() {
  const closed = evaluatePilot({
    fillsByAddress: {},
    feeWei: 0n,
    walletPilot: false,
    matchIsHome: false,
  });
  if (closed.pass) throw new Error("empty pilot passed");
  const ready = evaluatePilot({
    fillsByAddress: { a: 2, b: 2, c: 2, d: 2, e: 2 },
    feeWei: 1n,
    walletPilot: true,
    matchIsHome: false,
  });
  if (!ready.pass) throw new Error("ready pilot failed");
  const movedHome = evaluatePilot({
    fillsByAddress: { a: 2, b: 2, c: 2, d: 2, e: 2 },
    feeWei: 1n,
    walletPilot: true,
    matchIsHome: true,
  });
  if (movedHome.pass) throw new Error("homepage move counted as the gate");
  console.log("pilot-gate self-test passed");
}

function matchIsHome(): boolean {
  const source = readFileSync(resolve(root, "apps/web/src/site.tsx"), "utf8");
  const line = source
    .split("\n")
    .find((row) => row.includes("export const matchIsHome"));
  return line?.includes("true") ?? true;
}

async function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const deployment = JSON.parse(
    readFileSync(resolve(root, "deployments/match.json"), "utf8"),
  ) as {
    elysiumMatch: string;
    homepage: string;
  };
  const rows = await readFills();
  const recent = rows.filter(
    (row) =>
      row.fundedAt >= Date.now() / 1000 - PILOT.windowDays * 86400 &&
      row.fill.status === 2 &&
      row.lock[6] === 2,
  );
  const fillsByAddress: Record<string, number> = {};
  let feeWei = 0n;
  for (const row of recent) {
    fillsByAddress[row.fill.exitUser] =
      (fillsByAddress[row.fill.exitUser] ?? 0) + 1;
    feeWei += row.fill.shiftFee;
  }
  const deployed = true;
  const result = evaluatePilot({
    fillsByAddress,
    feeWei,
    walletPilot: process.env.SHIFT_MATCH_WALLET_PILOT === "1",
    matchIsHome: matchIsHome(),
  });
  console.log(
    deployed
      ? "testnet deployment is set"
      : "testnet deployment is not set; on-chain fills and fees are 0",
  );
  for (const line of result.lines) console.log(line);
  console.log(
    result.pass
      ? "pilot gate passed"
      : "pilot gate not met; Match stays off the homepage",
  );
  if (deployment.homepage !== "landing")
    console.log("deployments/match.json homepage is not landing");
}

void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message.split("\n")[0] : "pilot failed",
  );
  process.exitCode = 1;
});
