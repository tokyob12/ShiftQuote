import { randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import { isAddress, verifyMessage, type Address, type Hex } from "viem";
import {
  canonical,
  chooseRoute,
  routeMessage,
  type Auth,
  type Book,
  type Offer,
  type Route,
  type Card,
} from "../../apps/web/src/routeQuote.ts";
export interface ChainChecks {
  lp(position: Address, owner: Address, q?: bigint): Promise<void>;
  balance(owner: Address, amount: bigint): Promise<void>;
  status(card: Card): Promise<number>;
  card(route: Route, card: Card, signed: boolean): Promise<void>;
}
const terminal = new Set(["settled", "refunded", "expired"]);
export class RouteBook {
  data: Book = { offers: [], routes: [] };
  used: string[] = [];
  constructor(
    readonly file: string,
    readonly source: Address,
    readonly chain: ChainChecks,
    readonly clock = () => Math.floor(Date.now() / 1000),
  ) {
    if (existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, "utf8"));
      this.data = saved.data;
      this.used = saved.used;
    }
  }
  save() {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(
      this.file + ".tmp",
      JSON.stringify({ data: this.data, used: this.used }),
      { mode: 0o600 },
    );
    renameSync(this.file + ".tmp", this.file);
  }
  async authorize(
    action: string,
    payload: unknown,
    auth: Auth,
    signature: Hex,
  ) {
    if (
      !isAddress(auth.owner) ||
      !/^[-a-zA-Z0-9]{16,80}$/.test(auth.nonce) ||
      !Number.isSafeInteger(auth.expires) ||
      auth.expires < this.clock() ||
      auth.expires > this.clock() + 300
    )
      throw Error("Expired or invalid authorization");
    const nonce = auth.owner.toLowerCase() + ":" + auth.nonce;
    if (this.used.includes(nonce)) throw Error("Authorization already used");
    if (
      !(await verifyMessage({
        address: auth.owner,
        message: routeMessage(this.source, action, payload, auth),
        signature,
      }))
    )
      throw Error("Invalid wallet signature");
    return nonce;
  }
  async sync() {
    for (const route of this.data.routes) {
      if (terminal.has(route.state)) continue;
      if (route.card) {
        const state = await this.chain.status(route.card);
        if (state === 1) route.state = "funded";
        else if (state === 2) route.state = "settled";
        else if (state === 3) route.state = "refunded";
        else if (
          this.clock() >
          Math.max(route.expires, Number(route.card.input.quotedAt) + 660)
        )
          route.state = "expired";
      } else if (this.clock() > route.expires) route.state = "expired";
    }
    this.save();
  }
  async mutate(action: string, payload: any, auth: Auth, signature: Hex) {
    const nonce = await this.authorize(action, payload, auth, signature);
    await this.sync();
    const now = this.clock();
    let result: unknown;
    if (action === "offer") {
      if (this.data.offers.length >= 5000)
        throw Error("Order book capacity reached; contact operator");
      if (
        !["lp", "deposit"].includes(payload.kind) ||
        !/^\d{1,36}$/.test(payload.amount) ||
        !/^\d{1,36}$/.test(payload.price) ||
        BigInt(payload.amount) <= 0n ||
        BigInt(payload.price) <= 0n ||
        !Number.isSafeInteger(payload.expires) ||
        payload.expires < now + 180 ||
        payload.expires > now + 86400
      )
        throw Error("Invalid offer terms");
      if (
        this.data.offers.filter(
          (o) =>
            o.owner.toLowerCase() === auth.owner.toLowerCase() &&
            o.expires > now,
        ).length >= 10
      )
        throw Error("Cancel an existing offer first");
      if (payload.kind === "lp") {
        if (!isAddress(payload.position)) throw Error("Invalid LP position");
        await this.chain.lp(
          payload.position,
          auth.owner,
          BigInt(payload.amount),
        );
      } else await this.chain.balance(auth.owner, BigInt(payload.amount));
      const offer: Offer = {
        id: randomUUID(),
        owner: auth.owner,
        kind: payload.kind,
        position: payload.kind === "lp" ? payload.position : this.source,
        amount: payload.amount,
        price: payload.price,
        expires: payload.expires,
        signature,
        auth,
      };
      this.data.offers.push(offer);
      result = offer;
    } else if (action === "search") {
      if (
        !/^\d{1,36}$/.test(payload.usdc) ||
        !/^\d{1,36}$/.test(payload.minOut) ||
        BigInt(payload.usdc) <= 0n
      )
        throw Error("Invalid search amounts");
      if (
        this.data.routes.some(
          (r) =>
            r.exit.toLowerCase() === auth.owner.toLowerCase() &&
            !terminal.has(r.state),
        )
      )
        throw Error("Finish your existing route before searching again");
      const busy = new Set(
        this.data.routes
          .filter((r) => !terminal.has(r.state))
          .flatMap((r) => [r.lp, r.deposit]),
      );
      let selected;
      const active = this.data.routes.filter((r) => !terminal.has(r.state));
      const eligible = this.data.offers.filter(
        (o) =>
          o.owner.toLowerCase() !== auth.owner.toLowerCase() &&
          !active.some((r) =>
            o.kind === "lp"
              ? r.position.toLowerCase() === o.position.toLowerCase()
              : r.depositor.toLowerCase() === o.owner.toLowerCase(),
          ),
      );
      let verificationFailed = false;
      while (
        (selected = chooseRoute(
          eligible,
          busy,
          BigInt(payload.usdc),
          BigInt(payload.minOut),
          now,
        ))
      ) {
        try {
          await this.chain.lp(
            selected.lp.position,
            selected.lp.owner,
            selected.q,
          );
        } catch (error) {
          verificationFailed = true;
          console.error(
            "LP route unavailable",
            error instanceof Error
              ? error.message.split("\n")[0]
              : "check failed",
          );
          busy.add(selected.lp.id);
          continue;
        }
        try {
          await this.chain.balance(selected.deposit.owner, selected.payment);
        } catch (error) {
          verificationFailed = true;
          console.error(
            "Incoming route unavailable",
            error instanceof Error
              ? error.message.split("\n")[0]
              : "check failed",
          );
          busy.add(selected.deposit.id);
          continue;
        }
        break;
      }
      if (!selected)
        throw Error(
          verificationFailed
            ? "Unable to verify advertised liquidity right now. Refresh offers and try again; no funds were moved."
            : "No compatible match yet. Your funds remain in your wallet. Try again when offers arrive.",
        );
      const route: Route = {
        id: randomUUID(),
        exit: auth.owner,
        lp: selected.lp.id,
        deposit: selected.deposit.id,
        position: selected.lp.position,
        depositor: selected.deposit.owner,
        signer: selected.lp.owner,
        usdc: payload.usdc,
        whype: String(selected.q),
        payment: String(selected.payment),
        depositorOut: String(selected.depositorOut),
        gasElysium: "0",
        gasHyper: "0",
        expires: now + 120,
        state: "held",
      };
      this.data.routes.push(route);
      result = route;
    } else if (action === "request" || action === "approve") {
      const route = this.data.routes.find((r) => r.id === payload.id);
      if (!route || terminal.has(route.state) || route.state === "funded")
        throw Error("Route unavailable");
      const approved = action === "approve";
      if (
        (approved ? route.signer : route.exit).toLowerCase() !==
        auth.owner.toLowerCase()
      )
        throw Error("Wrong participant");
      if (approved ? route.state !== "requested" : route.state !== "held")
        throw Error("Route is not in the required state");
      await this.chain.card(route, payload.card, approved);
      if (
        approved &&
        canonical({ ...payload.card, signature: undefined }) !==
          canonical({ ...route.card, signature: undefined })
      )
        throw Error("Quote terms changed");
      route.card = payload.card;
      route.expires = Number(payload.card.input.quotedAt) + 660;
      route.state = approved ? "signed" : "requested";
      result = route;
    } else if (action === "cancelRoute") {
      const route = this.data.routes.find((r) => r.id === payload.id);
      if (!route || route.exit.toLowerCase() !== auth.owner.toLowerCase())
        throw Error("Wrong route owner");
      if (!["held", "requested"].includes(route.state) || route.card?.signature)
        throw Error("Signed or funded routes must finish or expire");
      route.state = "expired";
      result = { ok: true };
    } else if (action === "cancel") {
      const offer = this.data.offers.find((o) => o.id === payload.id);
      if (!offer || offer.owner.toLowerCase() !== auth.owner.toLowerCase())
        throw Error("Wrong offer owner");
      if (
        this.data.routes.some(
          (r) =>
            !terminal.has(r.state) &&
            (r.lp === offer.id || r.deposit === offer.id),
        )
      )
        throw Error("Offer is held by a route; wait for expiry or settlement");
      offer.expires = now;
      result = { ok: true };
    } else throw Error("Unknown action");
    this.used.push(nonce);
    this.save();
    return result;
  }
}
