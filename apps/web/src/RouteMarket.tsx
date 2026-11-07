import { useEffect, useState } from "react";
import {
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import type { Auth, Book, Card, Route } from "./routeQuote";

type Props = {
  role: "exit" | "deposit" | "lp";
  usdc: string;
  locked: boolean;
  setBudget: (value: string) => void;
  position: Address;
  fillId: string;
  authorize: (
    action: string,
    payload: unknown,
  ) => Promise<{ auth: Auth; signature: Hex }>;
  prepare: (route: Route) => Promise<Card>;
  approve: (card: Card) => Promise<Card>;
  load: (card: Card) => void;
};
export function RouteMarket(props: Props) {
  const [book, setBook] = useState<Book>({ offers: [], routes: [] }),
    [owner, setOwner] = useState(""),
    [message, setMessage] = useState("Checking the shared order book…"),
    [online, setOnline] = useState(false),
    [working, setWorking] = useState(false),
    [amount, setAmount] = useState("0.05"),
    [price, setPrice] = useState("80"),
    [ratio, setRatio] = useState("1.001"),
    [minOut, setMinOut] = useState("0");
  async function refresh() {
    try {
      const res = await fetch("/route-api/book");
      const body = await res.json();
      if (!res.ok || !Array.isArray(body.offers) || !Array.isArray(body.routes))
        throw Error();
      setBook(body);
      setOnline(true);
      setMessage((m) =>
        m.startsWith("Checking") || m.startsWith("Discovery offline")
          ? "Offer discovery is online. Quotes need wallet confirmation."
          : m,
      );
    } catch {
      setOnline(false);
      setMessage(
        "Discovery offline. You can still use the manual public-request flow below.",
      );
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const route = book.routes.find(
      (r) => r.card?.fillId === props.fillId && r.state === "signed",
    );
    if (route?.card) {
      let current;
      try {
        current = JSON.parse(
          localStorage.getItem("shift-match-quote") || "null",
        );
      } catch {}
      if (current?.signature !== route.card.signature) props.load(route.card);
    }
  }, [book, props.fillId]);
  async function action(name: string, payload: unknown) {
    const signed = await props.authorize(name, payload);
    setOwner(signed.auth.owner);
    const res = await fetch("/route-api/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: name, payload, ...signed }),
    });
    const body = await res.json();
    if (!res.ok) throw Error(body.error ?? "Discovery request failed");
    return body;
  }
  async function run(work: () => Promise<void>) {
    if (working) return;
    setWorking(true);
    try {
      await work();
      await refresh();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message.split("\n")[0] : "Request failed",
      );
    } finally {
      setWorking(false);
    }
  }
  const routes = book.routes.filter(
    (r) =>
      owner &&
      [r.exit, r.depositor, r.signer].some(
        (a) => a.toLowerCase() === owner.toLowerCase(),
      ) &&
      !["expired", "settled", "refunded"].includes(r.state),
  );
  const activeOffers = book.offers.filter((o) => o.expires > Date.now() / 1000);
  return (
    <section
      className="route-market"
      aria-labelledby="route-market-title"
      aria-busy={working}
    >
      <div className="route-market-head">
        <div>
          <p className="match-kicker">Route Quote + automatic matching</p>
          <h2 id="route-market-title">
            {props.role === "exit"
              ? "Find the other side."
              : props.role === "lp"
                ? "Make your inventory discoverable."
                : "Find an exit to fund."}
          </h2>
        </div>
        <span className="route-availability">
          {online
            ? `${activeOffers.filter((o) => o.kind === "lp").length} LP offers · ${activeOffers.filter((o) => o.kind === "deposit").length} incoming offers`
            : "Discovery offline"}
        </span>
      </div>
      <p>
        Matching is off-chain. Your funds stay in your wallet until you approve
        an escrow transaction. Each route uses one LP and one incoming
        participant.
      </p>
      <fieldset disabled={working || !online}>
        {props.role === "exit" ? (
          <div className="route-form">
            <label>
              USDC budget on Elysium
              <input
                disabled={props.locked}
                value={props.usdc}
                onChange={(e) => props.setBudget(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label>
              Minimum HYPE to receive on HyperEVM
              <input
                value={minOut}
                onChange={(e) => setMinOut(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <button
              className="btn primary"
              type="button"
              disabled={props.locked}
              onClick={() =>
                void run(async () => {
                  const route = (await action("search", {
                    usdc: String(parseUnits(props.usdc, 6)),
                    minOut: String(parseEther(minOut)),
                  })) as Route;
                  const card = await props.prepare(route);
                  await action("request", { id: route.id, card });
                  setMessage(
                    "Match found. Your public request is in the LP’s inbox. Save your private recovery file; the app will load the approved quote here.",
                  );
                })
              }
            >
              Find a route for {props.usdc} mUSDC
            </button>
          </div>
        ) : (
          <div className="route-form">
            <label>
              {props.role === "lp"
                ? "Maximum WHYPE per route"
                : "Maximum HYPE to pay on HyperEVM"}
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label>
              {props.role === "lp"
                ? "Your ask · mUSDC per HYPE"
                : "Minimum Elysium HYPE per HyperEVM HYPE"}
              <input
                value={props.role === "lp" ? price : ratio}
                onChange={(e) =>
                  props.role === "lp"
                    ? setPrice(e.target.value)
                    : setRatio(e.target.value)
                }
                inputMode="decimal"
              />
            </label>
            <button
              className="btn primary"
              type="button"
              onClick={() =>
                void run(async () => {
                  await action("offer", {
                    kind: props.role === "lp" ? "lp" : "deposit",
                    position: props.position,
                    amount: String(parseEther(amount)),
                    price: String(
                      props.role === "lp"
                        ? parseUnits(price, 6)
                        : parseEther(ratio),
                    ),
                    expires: Math.floor(Date.now() / 1000) + 1800,
                  });
                  setMessage(
                    "Offer published for 30 minutes. Keep this page open for requests. No funds were moved.",
                  );
                })
              }
            >
              Publish {props.role === "lp" ? "LP" : "incoming"} offer
            </button>
          </div>
        )}
        <div className="home-actions">
          <button
            className="btn quiet"
            type="button"
            onClick={() =>
              void run(async () => {
                const signed = await props.authorize("inbox", {});
                setOwner(signed.auth.owner);
                setMessage(
                  "Wallet connected. Your active offers and routes appear below.",
                );
              })
            }
          >
            Connect to view my inbox
          </button>
          <button
            className="btn quiet"
            type="button"
            onClick={() => void refresh()}
          >
            Refresh offers
          </button>
        </div>
      </fieldset>
      <p role="status" className="route-status">
        {message}
      </p>
      {routes.map((route) => (
        <article className="route-card" key={route.id}>
          <div className="route-market-head">
            <strong>
              {route.state === "requested"
                ? "Waiting for LP approval"
                : route.state === "signed"
                  ? "Quote approved · ready for exit funding"
                  : route.state === "funded"
                    ? "Source funded · incoming HYPE needed"
                    : "Route found · request needed"}
            </strong>
            <small>{route.id.slice(0, 8)}</small>
          </div>
          <dl className="match-agreed-terms">
            <div>
              <dt>Exit pays on Elysium</dt>
              <dd>{formatUnits(BigInt(route.usdc), 6)} mUSDC</dd>
            </div>
            <div>
              <dt>Exit receives on HyperEVM</dt>
              <dd>{formatEther(BigInt(route.payment))} HYPE</dd>
            </div>
            <div>
              <dt>Depositor receives on Elysium</dt>
              <dd>{formatEther(BigInt(route.depositorOut))} HYPE</dd>
            </div>
            <div>
              <dt>Protocol fee from LP slice</dt>
              <dd>{formatEther((BigInt(route.whype) * 5n) / 10000n)} HYPE</dd>
            </div>
          </dl>
          <p>
            Wallet transaction gas is additional. This pilot quote includes no
            executor reimbursement.{" "}
            {route.state !== "funded"
              ? `Funding window ends ${new Date(route.expires * 1000).toLocaleTimeString()}.`
              : "Check the signed claim and refund deadlines before locking."}
          </p>
          <div className="home-actions">
            {["held", "requested"].includes(route.state) &&
            route.exit.toLowerCase() === owner.toLowerCase() ? (
              <button
                type="button"
                className="btn quiet"
                disabled={working}
                onClick={() =>
                  void run(async () => {
                    await action("cancelRoute", { id: route.id });
                    setMessage(
                      "Unsigned request cancelled. No funds were moved.",
                    );
                  })
                }
              >
                Cancel unsigned request
              </button>
            ) : null}
            {route.card ? (
              <button
                type="button"
                className="btn"
                disabled={working}
                onClick={() => {
                  props.load(route.card!);
                  setMessage(
                    "Request loaded below. Review amounts and deadlines before confirming in your wallet.",
                  );
                }}
              >
                Open this trade
              </button>
            ) : null}
            {route.state === "requested" &&
            route.signer.toLowerCase() === owner.toLowerCase() ? (
              <button
                type="button"
                className="btn primary"
                disabled={working}
                onClick={() =>
                  void run(async () => {
                    const card = await props.approve(route.card!);
                    await action("approve", { id: route.id, card });
                    setMessage(
                      "Quote approved. The exit user can now fund it; the depositor will see the funded request here.",
                    );
                  })
                }
              >
                Review and sign this route
              </button>
            ) : null}
            {route.state === "held" &&
            route.exit.toLowerCase() === owner.toLowerCase() ? (
              <button
                type="button"
                className="btn"
                disabled={working}
                onClick={() =>
                  void run(async () => {
                    const card = await props.prepare(route);
                    await action("request", { id: route.id, card });
                    setMessage("Request sent to the LP.");
                  })
                }
              >
                Prepare this request
              </button>
            ) : null}
          </div>
        </article>
      ))}
      {activeOffers
        .filter((o) => o.owner.toLowerCase() === owner.toLowerCase())
        .map((o) => (
          <div key={o.id} className="route-offer">
            <span>
              {o.kind === "lp" ? "LP" : "Incoming"} offer ·{" "}
              {formatEther(BigInt(o.amount))}{" "}
              {o.kind === "lp" ? "WHYPE" : "HYPE"} · expires{" "}
              {new Date(o.expires * 1000).toLocaleTimeString()}
            </span>
            <button
              className="btn quiet"
              type="button"
              disabled={working}
              onClick={() =>
                void run(async () => {
                  await action("cancel", { id: o.id });
                  setMessage("Offer cancelled.");
                })
              }
            >
              Cancel offer
            </button>
          </div>
        ))}
      <p className="field-help">
        Offers advertise intent, not locked liquidity. LPs approve exact fills;
        depositors confirm payment. If no compatible offers exist, no route is
        created. Advanced manual matching remains below.
      </p>
    </section>
  );
}
