import { existsSync, readFileSync } from "node:fs";
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

const evaluateAbi = [
  {
    type: "function",
    name: "evaluate",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

/** One HyperCore book posted into one KeeperBook. */
type Feed = {
  label: string;
  coin: string;
  book: Address | null;
  size: bigint;
  position: Address | null;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadAddress(): Address | null {
  const file = resolve(root, "apps/web/src/deployments.ts");
  const text = readFileSync(file, "utf8");
  const match = text.match(/keeperBook:\s*"(0x[a-fA-F0-9]{40})"/);
  if (!match) return null;
  const address = match[1] as Address;
  return address === "0x0000000000000000000000000000000000000000" ? null : address;
}

/** The second position reads HyperCore spot @107 (HYPE/USDC) from its own KeeperBook. */
function loadSpotFeed(): Feed | null {
  const file = resolve(root, "deployments/v2.json");
  if (!existsSync(file)) return null;
  const v2 = JSON.parse(readFileSync(file, "utf8")) as {
    spotKeeperBook?: Address;
    spotCoin?: string;
    positionV2?: Address;
  };
  if (!v2.spotKeeperBook) return null;
  const sizeTokens = BigInt(process.env.SHIFT_SPOT_SIZE ?? "10");
  return {
    label: "HYPE/USDC spot",
    coin: v2.spotCoin ?? "@107",
    book: v2.spotKeeperBook,
    size: sizeTokens * ONE,
    position: v2.positionV2 ?? null,
  };
}

async function fetchBook(coin: string): Promise<BookResponse> {
  const response = await fetch(INFO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "l2Book", coin }),
  });
  if (!response.ok) {
    throw new Error(`l2Book ${response.status}`);
  }
  return (await response.json()) as BookResponse;
}

async function main() {
  // The spot book for the second position is the default. The ETH book only feeds
  // the desk's snapshot line, so it is posted only when SHIFT_POST_ETH is set.
  const feeds: Feed[] = [];
  const spot = loadSpotFeed();
  if (spot) feeds.push(spot);
  if (process.env.SHIFT_POST_ETH) {
    feeds.push({ label: "ETH perp", coin: "ETH", book: loadAddress(), size: ONE, position: null });
  }
  if (feeds.length === 0) {
    console.log("nothing to post: deploy v2 to write deployments/v2.json, or set SHIFT_POST_ETH");
    return;
  }
  const key = process.env.SHIFT_PRIVATE_KEY;
  const account = key ? privateKeyToAccount(key.startsWith("0x") ? (key as `0x${string}`) : `0x${key}`) : null;
  const wallet = account
    ? createWalletClient({ account, chain: elysiumTestnet, transport: http(elysiumTestnet.rpcUrls.default.http[0]) })
    : null;
  const publicClient = createPublicClient({
    chain: elysiumTestnet,
    transport: http(elysiumTestnet.rpcUrls.default.http[0]),
  });

  for (const feed of feeds) {
    console.log(`${feed.label} (${feed.coin}) -> ${feed.book ?? "not deployed"}`);
  }
  console.log(`signer ${account?.address ?? "dry run"}`);

  // Feeds post one after another from the same signer, so nonces never collide.
  const post = async (feed: Feed) => {
    const book = await fetchBook(feed.coin);
    const quote = quoteFromBook(book.levels, feed.size);
    const height = BigInt(book.time ?? 0);
    console.log(
      `${feed.label} bid ${quote.bidX18} ask ${quote.askX18} mid ${quote.midX18} slippage ${quote.slippageBps} bps`,
    );
    if (wallet && account && feed.book) {
      const hash = await wallet.writeContract({
        address: feed.book,
        abi: keeperBookAbi,
        functionName: "setSnapshot",
        args: [quote.bidX18, quote.askX18, quote.slippageBps, height],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`posted ${feed.label} ${hash}`);
      if (feed.position) {
        const decision = await wallet.writeContract({
          address: feed.position,
          abi: evaluateAbi,
          functionName: "evaluate",
        });
        await publicClient.waitForTransactionReceipt({ hash: decision });
        console.log(`evaluated ${feed.label} ${decision}`);
      }
    }
  };

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    for (const feed of feeds) {
      try {
        await post(feed);
      } catch (error) {
        console.error(`${feed.label}: ${error instanceof Error ? error.message : error}`);
      }
    }
    busy = false;
  };

  await tick();
  setInterval(tick, POLL_MS);
}

main();
