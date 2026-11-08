import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { RouteBook } from "./route-book.ts";
import { routeMessage, type Offer } from "../../apps/web/src/routeQuote.ts";
import {
  acceptCachedIndex,
  deadlineAlerts,
  extractClaimSecret,
  secretAccepted,
  secretHashOf,
  type ClaimIndex,
} from "./claim-queue.ts";
import { decideDestination } from "../../apps/web/src/claimConfirm.ts";
import { nextSwapStep } from "../../apps/web/src/deskSwap.ts";
import { judgeReadiness, type ReadyFacts } from "./readiness.ts";
import { allowRate, clientAddress, createGate, createSnapshot } from "./route-guard.ts";

const fillId = ("0x" + "ab".repeat(32)) as Hex;
const secret = ("0x" + "cd".repeat(32)) as Hex;
const claimAbi = parseAbi(["function claim(bytes32 fillId, bytes32 secret)"]);
const ready: ReadyFacts = {
  chainId: 99801,
  signerMatches: true,
  bookAgeMs: 1000,
  indexerLagBlocks: 10n,
  executorAgeMs: 1000,
  pendingClaims: 0,
  settlementSeen: true,
  lastSettlement: null,
  gasWei: null,
  executorMode: "dry-run",
};

function offer(owner: Address, id: string, expires: number): Offer {
  return {
    id,
    owner,
    kind: "deposit",
    position: "0x1111111111111111111111111111111111111111",
    amount: "1",
    price: "1",
    expires,
    signature: "0x",
    auth: { owner, nonce: "old-nonce-number-" + id, expires: 1 },
  };
}

test("gate: one-layer wrapper yields a secret and a raw forwarder does not", () => {
  const claim = encodeFunctionData({ abi: claimAbi, functionName: "claim", args: [fillId, secret] });
  const wrapped = encodeFunctionData({
    abi: parseAbi(["function exec(bytes data)"]),
    functionName: "exec",
    args: [claim],
  });
  const found = extractClaimSecret(wrapped, fillId);
  assert.equal("secret" in found ? found.secret : "", secret);
  const forward = encodeFunctionData({
    abi: parseAbi(["function forward(address,bytes32,bytes32)"]),
    functionName: "forward",
    args: ["0x1111111111111111111111111111111111111111", fillId, secret],
  });
  assert.equal("reason" in extractClaimSecret(forward, fillId), true);
  assert.equal(secretAccepted(secret, secretHashOf(secret)), true);
  assert.equal(secretAccepted(secret, secretHashOf(("0x" + "11".repeat(32)) as Hex)), false);
});

test("gate: a reorg drops the claim index and an unparsed item survives a restart", () => {
  const saved: ClaimIndex = {
    dest: "0x1111111111111111111111111111111111111111",
    through: "10",
    hash: ("0x" + "aa".repeat(32)) as Hex,
    claims: {},
    unparsed: [
      {
        fillId,
        transactionHash: ("0x" + "bb".repeat(32)) as Hex,
        blockHash: ("0x" + "cc".repeat(32)) as Hex,
        block: "9",
        reason: "calldata is not a direct or one-layer claim",
      },
    ],
  };
  assert.equal(acceptCachedIndex(saved, 20n, ("0x" + "dd".repeat(32)) as Hex), null);
  const restored = acceptCachedIndex(JSON.parse(JSON.stringify(saved)), 20n, saved.hash);
  assert.equal(restored?.unparsed[0].transactionHash, saved.unparsed[0].transactionHash);
  const alerts = deadlineAlerts(
    saved.unparsed,
    [{ id: fillId, status: 1, refundAfter: 1_900n }],
    1_000n,
  );
  assert.equal(alerts.length, 1);
  assert.equal(deadlineAlerts(saved.unparsed, [{ id: fillId, status: 1, refundAfter: 9_000n }], 1_000n).length, 0);
});

test("gate: destination confirmation rejects a reorg and an unread RPC", () => {
  const lock = {
    recipient: "0x2222222222222222222222222222222222222222",
    payment: 10n,
    secretHash: secretHashOf(secret),
    status: 2,
  };
  const claim = {
    blockNumber: 10n,
    blockHash: ("0x" + "ab".repeat(32)) as Hex,
    canonicalHash: ("0x" + "ab".repeat(32)) as Hex,
  };
  const base = {
    expectedRecipient: lock.recipient,
    expectedPayment: lock.payment,
    expectedSecretHash: lock.secretHash,
    first: lock,
    second: lock,
    tip: 12n,
    claim,
  };
  assert.equal(decideDestination(base).kind, "claimed");
  assert.equal(decideDestination({ ...base, claim: { ...claim, canonicalHash: ("0x" + "ff".repeat(32)) as Hex } }).kind, "unconfirmed");
  assert.equal(decideDestination({ ...base, first: null }).kind, "unconfirmed");
  assert.equal(decideDestination({ ...base, second: { ...lock, status: 1 } }).kind, "unconfirmed");
  assert.equal(decideDestination({ ...base, first: { ...lock, status: 1 }, second: { ...lock, status: 1 }, claim: null }).kind, "locked");
});

test("gate: a fresh quote cannot raise the approved maximum", () => {
  assert.equal(nextSwapStep({ allowance: 0n, cap: 100n, receipt: "none", quote: null, now: 10 }).action, "approve");
  assert.equal(nextSwapStep({ allowance: 100n, cap: 100n, receipt: "reverted", quote: null, now: 10 }).action, "halt");
  assert.equal(
    nextSwapStep({ allowance: 100n, cap: 100n, receipt: "success", quote: { payment: 90n, validUntil: 9 }, now: 10 }).action,
    "quote",
  );
  assert.equal(
    nextSwapStep({ allowance: 100n, cap: 100n, receipt: "success", quote: { payment: 140n, validUntil: 20 }, now: 10 }).action,
    "review",
  );
  assert.equal(
    nextSwapStep({ allowance: 100n, cap: 100n, receipt: "success", quote: { payment: 90n, validUntil: 20 }, now: 10 }).action,
    "swap",
  );
});

test("gate: gas alone does not make the route ready", () => {
  assert.equal(judgeReadiness(ready).ready, true);
  assert.equal(judgeReadiness({ ...ready, executorMode: "missing", gasWei: 10n ** 20n }).ready, false);
  assert.equal(judgeReadiness({ ...ready, executorMode: "live", gasWei: 1n }).ready, false);
  assert.equal(judgeReadiness({ ...ready, bookAgeMs: 20_000 }).blocked.includes("book"), true);
});

test("gate: expired history, restart, and the active cap", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shift-gate-"));
  try {
    const actor = privateKeyToAccount(generatePrivateKey());
    const source = "0x1111111111111111111111111111111111111111" as Address;
    const chain = { async lp() {}, async balance() {}, async status() { return 0; }, async card() {} };
    const file = join(dir, "book.json");
    const book = new RouteBook(file, source, chain, () => 100000);
    book.data.offers = Array.from({ length: 5000 }, (_, i) => offer(actor.address, String(i), 1));
    const payload = { kind: "deposit", position: source, amount: "1000", price: "1", expires: 101800 };
    const auth = { owner: actor.address, nonce: crypto.randomUUID(), expires: 100180 };
    const signature = await actor.signMessage({ message: routeMessage(source, "offer", payload, auth) });
    await book.mutate("offer", payload, auth, signature);
    await assert.rejects(book.mutate("offer", payload, auth, signature), /already used/);
    const restarted = new RouteBook(file, source, chain, () => 100000);
    assert.equal(restarted.archive.length, 5000);
    const again = { ...auth, nonce: crypto.randomUUID() };
    await restarted.mutate(
      "offer",
      payload,
      again,
      await actor.signMessage({ message: routeMessage(source, "offer", payload, again) }),
    );
    assert.equal(restarted.data.offers.length, 2);
    const full = new RouteBook(join(dir, "full.json"), source, chain, () => 100000);
    full.data.offers = Array.from({ length: 5000 }, (_, i) => offer(actor.address, "live-" + i, 200000));
    const third = { ...auth, nonce: crypto.randomUUID() };
    await assert.rejects(
      full.mutate("offer", payload, third, await actor.signMessage({ message: routeMessage(source, "offer", payload, third) })),
      /capacity reached/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("gate: traffic shares one snapshot and the queue stays bounded", async () => {
  let calls = 0;
  const snapshot = createSnapshot(5_000, async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return calls;
  });
  const values = await Promise.all(Array.from({ length: 20 }, () => snapshot()));
  assert.deepEqual(values, Array(20).fill(1));
  assert.equal(calls, 1);
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gate = createGate(2);
  const first = gate(() => held);
  const second = gate(() => held);
  await assert.rejects(gate(() => Promise.resolve("extra")), /busy/);
  release?.();
  await Promise.all([first, second]);
  assert.equal(clientAddress("1.2.3.4", { "cf-connecting-ip": "9.9.9.9" }, "cf-connecting-ip"), null);
  assert.equal(clientAddress("127.0.0.1", { "cf-connecting-ip": "9.9.9.9" }, undefined), null);
  assert.equal(clientAddress("127.0.0.1", { "cf-connecting-ip": "9.9.9.9" }, "cf-connecting-ip"), "9.9.9.9");
  assert.equal(clientAddress("127.0.0.1", { "x-forwarded-for": "9.9.9.9, 1.1.1.1" }, "x-forwarded-for"), null);
  const buckets = new Map<string, { at: number; n: number }>();
  assert.equal(allowRate(buckets, "wallet:a", 1_000, 2), true);
  assert.equal(allowRate(buckets, "wallet:a", 1_100, 2), true);
  assert.equal(allowRate(buckets, "wallet:a", 1_200, 2), false);
});
