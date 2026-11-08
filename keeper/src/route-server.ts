import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import {
  createPublicClient,
  http,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { signedDeskQuote } from "./signed-quotes.ts";
import { RouteBook, type ChainChecks } from "./route-book.ts";
import {
  sourceAddress,
  sourceAbi,
  destClient,
  deployment,
  root,
  shortError,
  readRecoveryQueue,
} from "./match-runtime.ts";
import { signedDeskAbi, signedDeskAddress } from "../../apps/web/src/signedDesk.ts";
import { judgeReadiness, type ReadyFacts } from "./readiness.ts";
import { allowRate, clientAddress, createGate, createSnapshot } from "./route-guard.ts";
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
const gate = createGate(8);
const bookView = createSnapshot(4000, () =>
  gate(async () => {
    await book.sync();
    return { offers: book.data.offers, routes: book.data.routes };
  }),
);
const readinessView = createSnapshot(15000, async () => {
  const now = Date.now();
  const facts: ReadyFacts = {
    chainId: null,
    signerMatches: null,
    bookAgeMs: null,
    indexerLagBlocks: null,
    executorAgeMs: null,
    pendingClaims: null,
    settlementSeen: false,
    lastSettlement: null,
    gasWei: null,
    executorMode: "missing",
  };
  try {
    facts.chainId = await sourceClient.getChainId();
  } catch {
    /* leave chain unconfirmed */
  }
  try {
    const key = process.env.SHIFT_QUOTE_KEY as Hex | undefined;
    if (!key) facts.signerMatches = false;
    else {
      const local = privateKeyToAccount(key).address;
      const onchain = await sourceClient.readContract({
        address: signedDeskAddress,
        abi: signedDeskAbi,
        functionName: "quoteSigner",
      });
      facts.signerMatches = local.toLowerCase() === onchain.toLowerCase();
    }
  } catch {
    facts.signerMatches = null;
  }
  try {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "l2Book", coin: "@107" }),
      signal: AbortSignal.timeout(8000),
    });
    const market = (await response.json()) as { time?: number };
    if (typeof market.time === "number") facts.bookAgeMs = now - market.time;
  } catch {
    /* leave the book age unconfirmed */
  }
  try {
    const indexPath = root + "keeper/.match-dest-index.json";
    if (existsSync(indexPath)) {
      const saved = JSON.parse(readFileSync(indexPath, "utf8")) as { through?: string };
      if (saved.through !== undefined) {
        facts.indexerLagBlocks = (await destClient.getBlockNumber()) - BigInt(saved.through);
        facts.pendingClaims = readRecoveryQueue().length;
      }
    }
  } catch {
    facts.indexerLagBlocks = null;
  }
  try {
    const statusPath = root + "keeper/.match-executor.json";
    if (existsSync(statusPath)) {
      const status = JSON.parse(readFileSync(statusPath, "utf8")) as {
        lastLoop?: number;
        lastSuccess?: number | null;
        mode?: "live" | "dry-run";
        address?: Address | null;
      };
      if (typeof status.lastLoop === "number") facts.executorAgeMs = now - status.lastLoop;
      if (status.mode === "live" || status.mode === "dry-run") facts.executorMode = status.mode;
      facts.settlementSeen = Object.prototype.hasOwnProperty.call(status, "lastSuccess");
      facts.lastSettlement = typeof status.lastSuccess === "number" ? status.lastSuccess : null;
      if (facts.executorMode === "live" && status.address)
        facts.gasWei = await sourceClient.getBalance({ address: status.address });
    }
  } catch {
    facts.executorMode = "missing";
  }
  const judged = judgeReadiness(facts);
  return {
    ok: true,
    ready: judged.ready,
    blocked: judged.blocked,
    chainId: facts.chainId,
    source: sourceAddress,
    signedQuotes: judged.checks.signer,
    pendingClaims: facts.pendingClaims,
    lastSettlement: facts.lastSettlement,
  };
});
const origins = (
  process.env.SHIFT_ROUTE_ORIGINS ??
  "http://127.0.0.1:5180,http://localhost:5180,http://127.0.0.1:5181,https://shifthl.xyz,https://www.shifthl.xyz"
).split(",");
const limits = new Map<string, { at: number; n: number }>();
let headersProbed = false;
function probeHeaders(req: import("node:http").IncomingMessage) {
  if (headersProbed) return;
  headersProbed = true;
  const sample: Record<string, string> = {};
  for (const name of ["cf-connecting-ip", "x-forwarded-for", "x-real-ip", "true-client-ip", "x-vercel-forwarded-for"]) {
    const raw = req.headers[name];
    if (typeof raw !== "string" || raw === "") continue;
    const first = raw.split(",")[0].trim();
    sample[name] = /^(\d{1,3}\.){3}\d{1,3}$/.test(first) ? first.replace(/\d+$/, "x") : "present";
  }
  try {
    writeFileSync(
      root + "keeper/.header-probe.json",
      JSON.stringify({ peer: req.socket.remoteAddress ?? null, names: Object.keys(req.headers).sort(), sample }),
      { mode: 0o600 },
    );
  } catch {
    /* The next request tries again. */
    headersProbed = false;
  }
}
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
    probeHeaders(req);
    if (origin && !origins.includes(origin)) throw Error("Origin not allowed");
    const now = Date.now();
    const client = clientAddress(
      req.socket.remoteAddress,
      req.headers,
      process.env.SHIFT_TRUSTED_CLIENT_HEADER,
    );
    if (!allowRate(limits, "public", now, 300)) {
      reply(429, { error: "Too many requests; retry shortly" });
      return;
    }
    if (client && !allowRate(limits, "ip:" + client, now, 120)) {
      reply(429, { error: "Too many requests; retry shortly" });
      return;
    }
    if (limits.size > 10000)
      for (const [k, v] of limits) if (now - v.at > 60000) limits.delete(k);
    if (req.url === "/route-api/health") {
      reply(200, await readinessView());
      return;
    }
    if (req.url === "/route-api/recovery-queue") {
      reply(200, {
        unparsed: readRecoveryQueue().map((item) => ({
          fillId: item.fillId,
          transactionHash: item.transactionHash,
          blockHash: item.blockHash,
          block: item.block,
          reason: item.reason,
        })),
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
      reply(200, await bookView());
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
    const body = JSON.parse(raw);
    const wallet = (req.url === "/route-api/desk-quote" ? body.caller : body.auth?.owner)?.toLowerCase();
    if (wallet && !allowRate(limits, "wallet:" + wallet, now, 30)) {
      reply(429, { error: "Too many requests; retry shortly" });
      return;
    }
    if (req.url === "/route-api/desk-quote") {
      reply(200, await gate(() => signedDeskQuote(body, sourceClient)));
      return;
    }
    const { action, payload, auth, signature } = body;
    const result = await gate(() => book.mutate(action, payload, auth, signature));
    reply(200, result);
  } catch (error) {
    const detail = error as { shortMessage?: string; details?: string };
    const message = shortError(error);
    if (message.includes("busy")) {
      reply(429, { error: "Route book is busy; retry shortly" });
      return;
    }
    console.error("Route API failure", detail.shortMessage ?? message, detail.details ?? "");
    reply(400, { error: message });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(
  Number(process.env.SHIFT_ROUTE_PORT ?? 8787),
  process.env.SHIFT_ROUTE_HOST ?? "127.0.0.1",
  () => console.log("Route Quote book listening; source", sourceAddress),
);
