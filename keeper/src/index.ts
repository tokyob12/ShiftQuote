import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { elysiumTestnet } from "./chain.ts";
import { quoteFromBook, type Level } from "./slippage.ts";

const ONE = 10n ** 18n;
const SIZE = ONE;
const POLL_MS = 5_000;
const INFO_URL = "https://api.hyperliquid.xyz/info";

const keeperBookAbi = [
  {
    type: "function",
    name: "setSnapshot",
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

type BookResponse = {
  time?: number;
  levels: [Level[], Level[]];
};

function loadAddress(): Address | null {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), "../../apps/web/src/deployments.ts");
  const text = readFileSync(file, "utf8");
  const match = text.match(/keeperBook:\s*"(0x[a-fA-F0-9]{40})"/);
  if (!match) return null;
  const address = match[1] as Address;
  return address === "0x0000000000000000000000000000000000000000" ? null : address;
}

async function fetchBook(): Promise<BookResponse> {
  const response = await fetch(INFO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "l2Book", coin: "ETH" }),
  });
  if (!response.ok) {
    throw new Error(`l2Book ${response.status}`);
  }
  return (await response.json()) as BookResponse;
}

async function main() {
  const keeperBook = loadAddress();
  const key = process.env.SHIFT_PRIVATE_KEY;
  const account = key ? privateKeyToAccount(key.startsWith("0x") ? (key as `0x${string}`) : `0x${key}`) : null;
  const wallet = account
    ? createWalletClient({ account, chain: elysiumTestnet, transport: http(elysiumTestnet.rpcUrls.default.http[0]) })
    : null;
  const publicClient = createPublicClient({
    chain: elysiumTestnet,
    transport: http(elysiumTestnet.rpcUrls.default.http[0]),
  });

  console.log(`keeper book ${keeperBook ?? "not deployed"}`);
  console.log(`signer ${account?.address ?? "dry run"}`);

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const book = await fetchBook();
      const quote = quoteFromBook(book.levels, SIZE);
      const height = BigInt(book.time ?? 0);
      console.log(
        `ETH bid ${quote.bidX18} ask ${quote.askX18} mid ${quote.midX18} slippage ${quote.slippageBps} bps`,
      );
      if (wallet && account && keeperBook) {
        const hash = await wallet.writeContract({
          address: keeperBook,
          abi: keeperBookAbi,
          functionName: "setSnapshot",
          args: [quote.bidX18, quote.askX18, quote.slippageBps, height],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`posted ${hash}`);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    } finally {
      busy = false;
    }
  };

  await tick();
  setInterval(tick, POLL_MS);
}

main();
