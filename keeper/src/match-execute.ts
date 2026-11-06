import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Lists settle calls for fills that were claimed on the destination and are still open
 * on the source. It does not read SHIFT_PRIVATE_KEY and it does not hold a user key.
 * A separate relayer key is optional. Without it, the process only prints the work.
 */

const ZERO = "0x0000000000000000000000000000000000000000";

export type FillReceipt = { fillId: string; claimed: boolean; settled: boolean };

export function pendingSettles(fills: FillReceipt[]): string[] {
  return fills.filter((fill) => fill.claimed && !fill.settled).map((fill) => fill.fillId);
}

function selfTest() {
  const none = pendingSettles([
    { fillId: "0x1", claimed: false, settled: false },
    { fillId: "0x2", claimed: true, settled: true },
  ]);
  const open = pendingSettles([{ fillId: "0x3", claimed: true, settled: false }]);
  if (none.length !== 0 || open.length !== 1 || open[0] !== "0x3") {
    throw new Error("settle selection failed");
  }
  if ("SHIFT_PRIVATE_KEY" in process.env) {
    console.log("deployer key is present and is not used by this process");
  }
  console.log("match-execute self-test ok");
}

function deployments() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const file = JSON.parse(readFileSync(resolve(root, "deployments/match.json"), "utf8")) as {
    sourceMatch?: string;
    destMatch?: string;
  };
  return file;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  if (process.argv.includes("--self-test")) {
    selfTest();
  } else {
    const file = deployments();
    const source = file.sourceMatch ?? ZERO;
    if (source === ZERO) {
      console.log("community match is not deployed; no settle work");
    } else if (!process.env.SHIFT_RELAYER_KEY) {
      console.log("relayer key is unset; settle stays a dry run");
    } else {
      console.log("relayer key is set; live settle still waits for a claimed fill list");
    }
  }
}
