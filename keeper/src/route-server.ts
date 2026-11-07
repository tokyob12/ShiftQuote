import { createServer } from "node:http";
import { resolve } from "node:path";
import {
  createPublicClient,
  http,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
import { signedDeskQuote } from "./signed-quotes.ts";
import { RouteBook, type ChainChecks } from "./route-book.ts";
import {
  sourceAddress,
  sourceAbi,
  destClient,
  deployment,
  root,
  shortError,
} from "./match-runtime.ts";
import { positionAbi, factoryAbi } from "../../apps/web/src/matchAbi.ts";
import { type Card } from "../../apps/web/src/routeQuote.ts";
import { elysiumTestnet, rpcUrl } from "./chain.ts";
const sourceClient = createPublicClient({
  chain: elysiumTestnet,
  transport: http(rpcUrl, {
    batch: { wait: 40, batchSize: 25 },
    retryCount: 4,
    retryDelay: 1500,
  }),
});
// Pace reads as well as batching: public providers may count each batch item.
let rpcQueue: Promise<unknown> = Promise.resolve();
const rawRead = sourceClient.readContract.bind(sourceClient);
sourceClient.readContract = ((request: Parameters<typeof rawRead>[0]) => {
  const work = rpcQueue.then(async () => {
    await new Promise((r) => setTimeout(r, 450));
    return rawRead(request);
  });
  rpcQueue = work.catch(() => {});
  return work;
}) as typeof sourceClient.readContract;
function input(card: Card) {
  const x = card.input;
  const keys = [
    "depositor",
    "recipient",
    "usdc",
    "whype",
    "secretHash",
    "claimBefore",
    "refundAfter",
    "exitUser",
    "gasElysium",
    "gasHyper",
    "quotedAt",
    "direction",
    "nonce",
    "expectedBonus",
  ];
  if (!x || Object.keys(x).sort().join() !== keys.sort().join())
    throw Error("Invalid public fill fields");
  return {
    depositor: x.depositor as Address,
    recipient: x.recipient as Address,
    usdc: BigInt(x.usdc),
    whype: BigInt(x.whype),
    secretHash: x.secretHash as Hex,
    claimBefore: BigInt(x.claimBefore),
    refundAfter: BigInt(x.refundAfter),
    exitUser: x.exitUser as Address,
    gasElysium: BigInt(x.gasElysium),
    gasHyper: BigInt(x.gasHyper),
    quotedAt: BigInt(x.quotedAt),
    direction: Number(x.direction),
    nonce: BigInt(x.nonce),
    expectedBonus: BigInt(x.expectedBonus),
  };
}
const checks: ChainChecks = {
  async lp(position, owner, q = 0n) {
    if (
      !(await sourceClient.readContract({
        address: deployment.lpFactory,
        abi: factoryAbi,
        functionName: "isPosition",
        args: [position],
      }))
    )
      throw Error("Unregistered LP position");
    const [
      signer,
      available,
      paused,
      reserved,
      maxFill,
      maxReserved,
      sourcePaused,
    ] = await Promise.all([
      sourceClient.readContract({
        address: position,
        abi: positionAbi,
        functionName: "signer",
      }),
      sourceClient.readContract({
        address: position,
        abi: positionAbi,
        functionName: "available",
      }),
      sourceClient.readContract({
        address: position,
        abi: positionAbi,
        functionName: "paused",
      }),
      sourceClient.readContract({
        address: position,
        abi: positionAbi,
        functionName: "reserved",
      }),
      sourceClient.readContract({
        address: position,
        abi: positionAbi,
        functionName: "maxFill",
      }),
      sourceClient.readContract({
        address: position,
        abi: positionAbi,
        functionName: "maxReserved",
      }),
      sourceClient.readContract({
        address: sourceAddress,
        abi: sourceAbi,
        functionName: "paused",
      }),
    ]);
    if (
      signer.toLowerCase() !== owner.toLowerCase() ||
      paused ||
      sourcePaused ||
      available < q ||
      maxFill < q ||
      reserved + q > maxReserved
    )
      throw Error("LP unavailable or limits exceeded");
  },
  async balance(owner, amount) {
    if ((await destClient.getBalance({ address: owner })) < amount + 10n ** 14n)
      throw Error("Depositor needs payment plus gas reserve");
  },
  async status(card) {
    return (
      await sourceClient.readContract({
        address: sourceAddress,
        abi: sourceAbi,
        functionName: "getFill",
        args: [card.fillId],
      })
    ).status;
  },
  async card(route, card, signed) {
    if (
      !card ||
      Object.keys(card).some(
        (k) =>
          !["version", "position", "fillId", "input", "signature"].includes(k),
      ) ||
      card.version !== 2 ||
      card.position?.toLowerCase() !== route.position.toLowerCase()
    )
      throw Error(
        "Only public v2 cards are accepted; never upload recovery secrets",
      );
    const x = input(card),
      now = BigInt(Math.floor(Date.now() / 1000));
    if (
      x.exitUser.toLowerCase() !== route.exit.toLowerCase() ||
      x.recipient.toLowerCase() !== route.exit.toLowerCase() ||
      x.depositor.toLowerCase() !== route.depositor.toLowerCase() ||
      x.usdc !== BigInt(route.usdc) ||
      x.whype !== BigInt(route.whype) ||
      x.gasElysium !== 0n ||
      x.gasHyper !== 0n ||
      x.direction !== 1 ||
      x.quotedAt > now + 10n ||
      x.quotedAt < now - 300n ||
      x.claimBefore < now + 600n ||
      x.claimBefore > now + 1800n ||
      x.refundAfter !== x.claimBefore + 7200n ||
      !/^0x[0-9a-fA-F]{64}$/.test(x.secretHash) ||
      BigInt(x.secretHash) === 0n
    )
      throw Error("Fill does not match the selected route");
    await checks.lp(route.position, route.signer, x.whype);
    await checks.balance(route.depositor, BigInt(route.payment));
    const [nonce, bonus, id] = await Promise.all([
      sourceClient.readContract({
        address: route.position,
        abi: positionAbi,
        functionName: "quoteNonce",
      }),
      sourceClient.readContract({
        address: sourceAddress,
        abi: sourceAbi,
        functionName: "previewBonus",
        args: [x.whype],
      }),
      sourceClient.readContract({
        address: sourceAddress,
        abi: sourceAbi,
        functionName: "hashFill",
        args: [route.position, x.exitUser, x],
      }),
    ]);
    if (nonce !== x.nonce || bonus !== x.expectedBonus || id !== card.fillId)
      throw Error("Quote nonce, bonus or identity changed");
    if (
      signed &&
      !(await verifyTypedData({
        address: route.signer,
        domain: {
          name: "Shift Match",
          version: "2",
          chainId: 99801,
          verifyingContract: sourceAddress,
        },
        types: { Quote: [{ name: "fillId", type: "bytes32" }] },
        primaryType: "Quote",
        message: { fillId: id },
        signature: card.signature!,
      }))
    )
      throw Error("Invalid LP fill signature");
  },
};
const book = new RouteBook(
  resolve(process.env.SHIFT_ROUTE_DATA ?? root + "keeper/.route-book.json"),
  sourceAddress,
  checks,
);
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}
const origins = (
  process.env.SHIFT_ROUTE_ORIGINS ??
  "http://127.0.0.1:5180,http://localhost:5180,http://127.0.0.1:5181,https://shifthl.xyz,https://www.shifthl.xyz"
).split(",");
const limits = new Map<string, { at: number; n: number }>();
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const origin = req.headers.origin;
  if (origin && origins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const reply = (status: number, value: unknown) => {
    res.writeHead(status);
    res.end(JSON.stringify(value));
  };
  try {
    if (origin && !origins.includes(origin)) throw Error("Origin not allowed");
    const ip = req.socket.remoteAddress ?? "unknown",
      now = Date.now();
    const limit = limits.get(ip);
    if (!limit || now - limit.at > 60000) limits.set(ip, { at: now, n: 1 });
    else if (++limit.n > 300) {
      reply(429, { error: "Too many requests; retry shortly" });
      return;
    }
    if (limits.size > 10000)
      for (const [k, v] of limits) if (now - v.at > 60000) limits.delete(k);
    if (req.url === "/route-api/health") {
      reply(200, {
        ok: true,
        chainId: 99801,
        source: sourceAddress,
        signedQuotes: !!process.env.SHIFT_QUOTE_KEY,
      });
      return;
    }
    if (
      req.url !== "/route-api/book" &&
      req.url !== "/route-api/action" &&
      req.url !== "/route-api/desk-quote"
    ) {
      reply(404, { error: "Not found" });
      return;
    }
    if (req.method === "GET" && req.url === "/route-api/book") {
      const data = await serial(async () => {
        await book.sync();
        return book.data;
      });
      reply(200, data);
      return;
    }
    if (
      req.method !== "POST" ||
      (req.url !== "/route-api/action" && req.url !== "/route-api/desk-quote")
    ) {
      reply(405, { error: "Method not allowed" });
      return;
    }
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw Error("JSON body required");
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 24000) {
        reply(413, { error: "Request too large" });
        return;
      }
    }
    if (req.url === "/route-api/desk-quote") {
      reply(200, await signedDeskQuote(JSON.parse(raw), sourceClient));
      return;
    }
    const { action, payload, auth, signature } = JSON.parse(raw);
    const result = await serial(() =>
      book.mutate(action, payload, auth, signature),
    );
    reply(200, result);
  } catch (error) {
    const detail = error as { shortMessage?: string; details?: string };
    console.error(
      "Route API failure",
      detail.shortMessage ?? shortError(error),
      detail.details ?? "",
    );
    reply(400, { error: shortError(error) });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(
  Number(process.env.SHIFT_ROUTE_PORT ?? 8787),
  process.env.SHIFT_ROUTE_HOST ?? "127.0.0.1",
  () => console.log("Route Quote book listening; source", sourceAddress),
);
