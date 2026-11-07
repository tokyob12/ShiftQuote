import { keccak256, stringToHex, type Address, type Hex } from "viem";
export type Offer = {
  id: string;
  owner: Address;
  kind: "lp" | "deposit";
  position: Address;
  amount: string;
  price: string;
  expires: number;
  signature: Hex;
  auth: Auth;
};
export type Auth = { owner: Address; nonce: string; expires: number };
export type Card = {
  version: number;
  position: string;
  fillId: Hex;
  input: Record<string, string>;
  signature?: Hex;
};
export type Route = {
  id: string;
  exit: Address;
  lp: string;
  deposit: string;
  position: Address;
  depositor: Address;
  signer: Address;
  usdc: string;
  whype: string;
  payment: string;
  depositorOut: string;
  gasElysium: string;
  gasHyper: string;
  expires: number;
  state:
    | "held"
    | "requested"
    | "signed"
    | "funded"
    | "settled"
    | "refunded"
    | "expired";
  card?: Card;
};
export type Book = { offers: Offer[]; routes: Route[] };
export function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonical((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}
export function routeMessage(
  source: string,
  action: string,
  payload: unknown,
  auth: Auth,
) {
  return `Shift Route Quote v1\nChain: 99801\nSource: ${source.toLowerCase()}\nAction: ${action}\nOwner: ${auth.owner.toLowerCase()}\nNonce: ${auth.nonce}\nExpires: ${auth.expires}\nPayload: ${keccak256(stringToHex(canonical(payload)))}`;
}
export function routeAmounts(q: bigint, gasE = 0n, gasH = 0n) {
  const payment = (q * 9980n) / 10000n;
  return {
    payment,
    lock: payment + gasH,
    depositorOut: q - (q * 5n) / 10000n - gasE,
  };
}
export function chooseRoute(
  offers: Offer[],
  busy: Set<string>,
  budget: bigint,
  minOut: bigint,
  now: number,
) {
  let best:
    | {
        lp: Offer;
        deposit: Offer;
        q: bigint;
        payment: bigint;
        depositorOut: bigint;
      }
    | undefined;
  for (const lp of offers.filter(
    (o) => o.kind === "lp" && o.expires > now + 120 && !busy.has(o.id),
  )) {
    const q = (budget * 10n ** 18n) / BigInt(lp.price);
    if (q < 10n ** 15n || q > BigInt(lp.amount)) continue;
    const { payment, depositorOut } = routeAmounts(q);
    if (payment < minOut) continue;
    for (const deposit of offers.filter(
      (o) => o.kind === "deposit" && o.expires > now + 120 && !busy.has(o.id),
    )) {
      if (
        deposit.owner.toLowerCase() === lp.owner.toLowerCase() ||
        payment > BigInt(deposit.amount) ||
        depositorOut * 10n ** 18n < payment * BigInt(deposit.price)
      )
        continue;
      if (!best || payment > best.payment)
        best = { lp, deposit, q, payment, depositorOut };
    }
  }
  return best;
}
