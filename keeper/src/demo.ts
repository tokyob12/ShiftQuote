import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { elysiumTestnet } from "./chain.ts";

const ONE = 10n ** 18n;
const LOC = { Uninitialized: 0, Quoted: 1, Pulled: 2, InTransit: 3, OnCoreIdle: 4, Resting: 5 } as const;

const positionAbi = [
  { type: "function", name: "location", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "elysiumBase", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transitBase", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "coreIdleBase", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "restingBase", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "quotedMidX18", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "spotLinked", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "base", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "quote", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "evaluate",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "swap",
    stateMutability: "nonpayable",
    inputs: [{ name: "baseOut", type: "uint256" }],
    outputs: [],
  },
  { type: "function", name: "shift", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "advanceScripted", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "returnScripted", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "setSpotLinked",
    stateMutability: "nonpayable",
    inputs: [{ name: "linked", type: "bool" }],
    outputs: [],
  },
] as const;

const bookAbi = [
  {
    type: "function",
    name: "set",
    stateMutability: "nonpayable",
    inputs: [
      { name: "bidX18_", type: "uint256" },
      { name: "askX18_", type: "uint256" },
      { name: "slippageBps_", type: "uint256" },
      { name: "coreHeight_", type: "uint64" },
    ],
    outputs: [],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

function loadAddresses() {
  const text = readDeployments();
  const pick = (name: string) => {
    const match = text.match(new RegExp(`${name}:\\s*"(0x[a-fA-F0-9]{40})"`));
    if (!match || match[1] === "0x0000000000000000000000000000000000000000") {
      throw new Error(`${name} is not deployed`);
    }
    return match[1] as Address;
  };
  return {
    position: pick("position"),
    scriptedBook: pick("scriptedBook"),
    base: pick("demoAsset"),
  };
}

function readDeployments() {
  return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../apps/web/src/deployments.ts"), "utf8");
}

async function main() {
  const key = process.env.SHIFT_PRIVATE_KEY;
  if (!key) throw new Error("SHIFT_PRIVATE_KEY is required");
  const account = privateKeyToAccount(key.startsWith("0x") ? (key as Hex) : `0x${key}`);
  const rpc = elysiumTestnet.rpcUrls.default.http[0];
  const publicClient = createPublicClient({ chain: elysiumTestnet, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: elysiumTestnet, transport: http(rpc) });
  const { position, scriptedBook, base } = loadAddresses();

  const read = async <T,>(functionName: string): Promise<T> =>
    publicClient.readContract({
      address: position,
      abi: positionAbi,
      functionName,
    }) as Promise<T>;

  const send = async (address: Address, abi: typeof positionAbi | typeof bookAbi, functionName: string, args: readonly unknown[] = []) => {
    const hash = await wallet.writeContract({
      address,
      abi: abi as typeof positionAbi,
      functionName,
      args,
    } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
    console.log(functionName, hash);
  };

  const assert = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
    console.log(`ok ${message}`);
  };

  let location = Number(await read("location"));
  if (location >= LOC.InTransit) {
    await send(position, positionAbi, "returnScripted");
    location = Number(await read("location"));
  }
  assert(location === LOC.Quoted || location === LOC.Pulled, "position is quoted or pulled before the demo");

  await send(scriptedBook, bookAbi, "set", [ONE, ONE, 10n, 1n]);
  await send(position, positionAbi, "evaluate");
  assert(Number(await read("location")) === LOC.Quoted, "tight book evaluates to Quoted");

  const baseBefore = await read<bigint>("elysiumBase");
  await send(position, positionAbi, "swap", [ONE]);
  const baseAfter = await read<bigint>("elysiumBase");
  assert(baseAfter === baseBefore - ONE, "swap sells 1 base token");

  const quoted = await read<bigint>("quotedMidX18");
  const wide = quoted + (quoted * 60n) / 10_000n;
  await send(scriptedBook, bookAbi, "set", [wide, wide, 10n, 2n]);
  await send(position, positionAbi, "evaluate");
  assert(Number(await read("location")) === LOC.Pulled, "60 bps move evaluates to Pulled");

  let swapReverted = false;
  try {
    await send(position, positionAbi, "swap", [ONE]);
  } catch {
    swapReverted = true;
  }
  assert(swapReverted, "swap reverts while Pulled");

  await send(scriptedBook, bookAbi, "set", [quoted, quoted, 10n, 3n]);
  await send(position, positionAbi, "evaluate");
  assert(Number(await read("location")) === LOC.Quoted, "price back inside the band evaluates to Quoted");

  await send(position, positionAbi, "setSpotLinked", [true]);
  const beforeShift = await read<bigint>("elysiumBase");
  const tokenBal = await publicClient.readContract({
    address: base,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [position],
  });
  await send(position, positionAbi, "shift");
  const slice = (beforeShift * 2500n) / 10_000n;
  assert(Number(await read("location")) === LOC.InTransit, "shift moves the position in transit");
  assert((await read<bigint>("transitBase")) === slice, "slice is 25% of the Elysium base");
  const tokenBalAfter = await publicClient.readContract({
    address: base,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [position],
  });
  assert(tokenBalAfter === tokenBal, "base tokens stay in the position contract");

  await send(position, positionAbi, "advanceScripted");
  assert(Number(await read("location")) === LOC.OnCoreIdle, "advance reaches OnCoreIdle");
  await send(position, positionAbi, "advanceScripted");
  assert(Number(await read("location")) === LOC.Resting, "advance reaches Resting");
  assert((await read<bigint>("restingBase")) === slice, "resting ledger holds the slice");

  await send(position, positionAbi, "returnScripted");
  await send(scriptedBook, bookAbi, "set", [ONE, ONE, 10n, 4n]);
  await send(position, positionAbi, "evaluate");
  assert(Number(await read("location")) === LOC.Quoted, "return and evaluate leave the position Quoted");
  console.log("demo path complete");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
