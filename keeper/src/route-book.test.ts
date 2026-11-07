import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { parseEther, type Address, type Hex } from "viem";
import { RouteBook, type ChainChecks } from "./route-book.ts";
import {
  chooseRoute,
  routeMessage,
  type Auth,
  type Card,
  type Route,
} from "../../apps/web/src/routeQuote.ts";
const source = "0x1111111111111111111111111111111111111111" as Address;
const position = "0x2222222222222222222222222222222222222222" as Address;
const lp = privateKeyToAccount(generatePrivateKey()),
  deposit = privateKeyToAccount(generatePrivateKey()),
  exit = privateKeyToAccount(generatePrivateKey());
function setup() {
  let now = 100000,
    status = 0,
    fail = false;
  const dir = mkdtempSync(join(tmpdir(), "shift-routes-"));
  const chain: ChainChecks = {
    async lp() {
      if (fail) throw Error("RPC down");
    },
    async balance() {},
    async status() {
      if (fail) throw Error("RPC down");
      return status;
    },
    async card() {},
  };
  const book = new RouteBook(join(dir, "book.json"), source, chain, () => now);
  return {
    book,
    dir,
    setNow: (n: number) => (now = n),
    setStatus: (n: number) => (status = n),
    setFail: (v: boolean) => (fail = v),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
async function signed(
  book: RouteBook,
  actor: typeof lp,
  action: string,
  payload: any,
) {
  const auth: Auth = {
    owner: actor.address,
    nonce: crypto.randomUUID(),
    expires: book.clock() + 180,
  };
  const signature = await actor.signMessage({
    message: routeMessage(source, action, payload, auth),
  });
  return { action, payload, auth, signature };
}
async function act(
  book: RouteBook,
  actor: typeof lp,
  action: string,
  payload: any,
) {
  const a = await signed(book, actor, action, payload);
  return book.mutate(a.action, a.payload, a.auth, a.signature);
}
async function seed(book: RouteBook) {
  await act(book, lp, "offer", {
    kind: "lp",
    position,
    amount: String(parseEther("1")),
    price: "80000000",
    expires: book.clock() + 1800,
  });
  await act(book, deposit, "offer", {
    kind: "deposit",
    position: source,
    amount: String(parseEther("1")),
    price: String(parseEther("1.001")),
    expires: book.clock() + 1800,
  });
}
const search = { usdc: "8000000", minOut: "0" };
test("best complete route respects size, minimum output and depositor ratio", async () => {
  const f = setup();
  try {
    await seed(f.book);
    const selected = chooseRoute(
      f.book.data.offers,
      new Set(),
      8000000n,
      0n,
      100000,
    )!;
    assert.equal(selected.q, parseEther("0.1"));
    assert.equal(selected.payment, parseEther("0.0998"));
    assert.equal(
      chooseRoute(
        f.book.data.offers,
        new Set(),
        8000000n,
        parseEther("0.1"),
        100000,
      ),
      undefined,
    );
    assert.equal(
      chooseRoute(f.book.data.offers, new Set(), 800000000n, 0n, 100000),
      undefined,
    );
    f.book.data.offers[1].price = String(parseEther("1.1"));
    assert.equal(
      chooseRoute(f.book.data.offers, new Set(), 8000000n, 0n, 100000),
      undefined,
    );
  } finally {
    f.cleanup();
  }
});
test("wallet signature rejects changed payload and replay survives restart", async () => {
  const f = setup();
  try {
    const a = await signed(f.book, lp, "offer", {
      kind: "lp",
      position,
      amount: String(parseEther("1")),
      price: "80000000",
      expires: 101800,
    });
    await assert.rejects(
      f.book.mutate(
        a.action,
        { ...a.payload, price: "1" },
        a.auth,
        a.signature,
      ),
      /signature/,
    );
    await f.book.mutate(a.action, a.payload, a.auth, a.signature);
    const restarted = new RouteBook(
      f.book.file,
      source,
      f.book.chain,
      f.book.clock,
    );
    await assert.rejects(
      restarted.mutate(a.action, a.payload, a.auth, a.signature),
      /already used/,
    );
  } finally {
    f.cleanup();
  }
});
test("one position and incoming wallet cannot back competing routes", async () => {
  const f = setup();
  try {
    await seed(f.book);
    await act(f.book, exit, "search", search);
    const other = privateKeyToAccount(generatePrivateKey());
    await assert.rejects(act(f.book, other, "search", search), /No compatible/);
    const offer = f.book.data.offers[1];
    await assert.rejects(
      act(f.book, exit, "cancel", { id: offer.id }),
      /Wrong offer/,
    );
    await assert.rejects(
      act(f.book, deposit, "cancel", { id: offer.id }),
      /held/,
    );
  } finally {
    f.cleanup();
  }
});
test("unpublished holds expire but signed requests remain held through signature lifetime", async () => {
  const f = setup();
  try {
    await seed(f.book);
    const r = (await act(f.book, exit, "search", search)) as Route;
    f.setNow(100121);
    await f.book.sync();
    assert.equal(r.state, "expired");
    const r2 = (await act(f.book, exit, "search", search)) as Route;
    const card = {
      version: 2,
      position,
      fillId: "0x" + "12".repeat(32),
      input: { quotedAt: "100121" },
    } as Card;
    await act(f.book, exit, "request", { id: r2.id, card });
    f.setNow(100300);
    await f.book.sync();
    assert.equal(r2.state, "requested");
    f.setNow(100782);
    await f.book.sync();
    assert.equal(r2.state, "expired");
  } finally {
    f.cleanup();
  }
});
test("funded routes do not release on timeout and RPC errors fail closed", async () => {
  const f = setup();
  try {
    await seed(f.book);
    const r = (await act(f.book, exit, "search", search)) as Route;
    await act(f.book, exit, "request", {
      id: r.id,
      card: {
        version: 2,
        position,
        fillId: "0x" + "12".repeat(32),
        input: { quotedAt: "100000" },
      },
    });
    f.setStatus(1);
    f.setNow(200000);
    await f.book.sync();
    assert.equal(r.state, "funded");
    f.setFail(true);
    await assert.rejects(f.book.sync(), /RPC down/);
    assert.equal(r.state, "funded");
    f.setFail(false);
    f.setStatus(2);
    await f.book.sync();
    assert.equal(r.state, "settled");
  } finally {
    f.cleanup();
  }
});
test("only named LP can approve and approval cannot change fill terms", async () => {
  const f = setup();
  try {
    await seed(f.book);
    const r = (await act(f.book, exit, "search", search)) as Route;
    const card = {
      version: 2,
      position,
      fillId: "0x" + "12".repeat(32),
      input: { quotedAt: "100000" },
    } as Card;
    await act(f.book, exit, "request", { id: r.id, card });
    await assert.rejects(
      act(f.book, deposit, "approve", { id: r.id, card }),
      /Wrong participant/,
    );
    await assert.rejects(
      act(f.book, lp, "approve", {
        id: r.id,
        card: { ...card, input: { quotedAt: "100001" }, signature: "0x12" },
      }),
      /terms changed/,
    );
    await act(f.book, lp, "approve", {
      id: r.id,
      card: { ...card, signature: "0x12" },
    });
    assert.equal(r.state, "signed");
  } finally {
    f.cleanup();
  }
});
test("best quote wins and stale or busy offers are excluded", async () => {
  const f = setup();
  try {
    await seed(f.book);
    const base = f.book.data.offers[0];
    f.book.data.offers.push({ ...base, id: "better", price: "70000000" });
    assert.equal(
      chooseRoute(f.book.data.offers, new Set(), 8000000n, 0n, 100000)?.lp.id,
      "better",
    );
    assert.equal(
      chooseRoute(f.book.data.offers, new Set(["better"]), 8000000n, 0n, 100000)
        ?.lp.id,
      base.id,
    );
    assert.equal(
      chooseRoute(f.book.data.offers, new Set(), 8000000n, 0n, 101700),
      undefined,
    );
  } finally {
    f.cleanup();
  }
});
test("cross-deployment authorization cannot be replayed", async () => {
  const f = setup();
  try {
    const a = await signed(f.book, lp, "offer", {
      kind: "lp",
      position,
      amount: "1000000000000000000",
      price: "80000000",
      expires: 101800,
    });
    const other = new RouteBook(
      join(f.dir, "other.json"),
      position,
      f.book.chain,
      f.book.clock,
    );
    await assert.rejects(
      other.mutate(a.action, a.payload, a.auth, a.signature),
      /signature/,
    );
  } finally {
    f.cleanup();
  }
});
test("unsigned request can cancel but a signed route cannot release its backing", async () => {
  const f = setup();
  try {
    await seed(f.book);
    let r = (await act(f.book, exit, "search", search)) as Route;
    await act(f.book, exit, "cancelRoute", { id: r.id });
    assert.equal(r.state, "expired");
    r = (await act(f.book, exit, "search", search)) as Route;
    const card = {
      version: 2,
      position,
      fillId: "0x" + "12".repeat(32),
      input: { quotedAt: "100000" },
    } as Card;
    await act(f.book, exit, "request", { id: r.id, card });
    await act(f.book, lp, "approve", {
      id: r.id,
      card: { ...card, signature: "0x12" },
    });
    await assert.rejects(
      act(f.book, exit, "cancelRoute", { id: r.id }),
      /Signed or funded/,
    );
    assert.equal(r.state, "signed");
  } finally {
    f.cleanup();
  }
});
