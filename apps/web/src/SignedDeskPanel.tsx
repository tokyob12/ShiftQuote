import { useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
  parseAbi,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
import { elysiumTestnet, rpcUrl } from "./chain";
import { deployments } from "./deployments";
import {
  signedDeskAddress,
  signedDeskAbi,
  signedDeskTypes,
  decodeDeskQuote,
  type DeskQuote,
} from "./signedDesk";
const client = createPublicClient({
  chain: elysiumTestnet,
  transport: http(rpcUrl, { batch: { wait: 40 }, retryDelay: 1500 }),
});
const tokenAbi = parseAbi([
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
  "function deposit() payable",
]);
export function SignedDesk({ account }: { account: Address | null }) {
  const [view, setView] = useState<{
      owner: Address;
      base: bigint;
      usdc: bigint;
      location: number;
      open: boolean;
    } | null>(null),
    [amount, setAmount] = useState("0.001"),
    [maximum, setMaximum] = useState("1"),
    [notice, setNotice] = useState(
      "Price updates are signed off-chain. Wallet actions still cost gas.",
    ),
    [busy, setBusy] = useState(false),
    [quote, setQuote] = useState<{ quote: DeskQuote; signature: Hex } | null>(
      null,
    ),
    [now, setNow] = useState(Math.floor(Date.now() / 1000));
  async function refresh() {
    try {
      const [owner, base, usdc, location, open] = await Promise.all([
        client.readContract({
          address: signedDeskAddress,
          abi: signedDeskAbi,
          functionName: "owner",
        }),
        client.readContract({
          address: signedDeskAddress,
          abi: signedDeskAbi,
          functionName: "elysiumBase",
        }),
        client.readContract({
          address: signedDeskAddress,
          abi: signedDeskAbi,
          functionName: "elysiumQuote",
        }),
        client.readContract({
          address: signedDeskAddress,
          abi: signedDeskAbi,
          functionName: "location",
        }),
        client.readContract({
          address: signedDeskAddress,
          abi: signedDeskAbi,
          functionName: "swapsOpen",
        }),
      ]);
      setView({ owner, base, usdc, location, open });
    } catch {
      setNotice("Position read unavailable. Refresh to retry.");
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  async function wallet() {
    if (!account || !window.ethereum)
      throw Error("Connect your Elysium wallet using the button above.");
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + elysiumTestnet.id.toString(16) }],
    });
    return createWalletClient({
      account,
      chain: elysiumTestnet,
      transport: custom(window.ethereum),
    });
  }
  async function fetchQuote(action: number) {
    if (!account) throw Error("Connect your wallet first.");
    const response = await fetch("/route-api/desk-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caller: account,
        action,
        size: String(parseEther(amount)),
      }),
    });
    const body = await response.json();
    if (!response.ok) throw Error(body.error ?? "Quote service unavailable");
    if (body.position?.toLowerCase() !== signedDeskAddress.toLowerCase())
      throw Error("Wrong quote deployment");
    const q = decodeDeskQuote(body.quote),
      signature = body.signature as Hex;
    const signer = await client.readContract({
      address: signedDeskAddress,
      abi: signedDeskAbi,
      functionName: "quoteSigner",
    });
    if (
      q.caller.toLowerCase() !== account.toLowerCase() ||
      q.action !== action ||
      q.validUntil < BigInt(Math.floor(Date.now() / 1000)) ||
      !(await verifyTypedData({
        address: signer,
        domain: {
          name: "Shift Signed Desk",
          version: "1",
          chainId: 99801,
          verifyingContract: signedDeskAddress,
        },
        types: signedDeskTypes,
        primaryType: "Quote",
        message: q,
        signature,
      }))
    )
      throw Error("Invalid or expired signed quote");
    return { quote: q, signature };
  }
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message.split("\n")[0] : "Action failed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm(hash: Hex) {
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success")
      throw Error("Transaction reverted; request a fresh quote if it expired.");
    setNotice("Confirmed: " + hash);
    setQuote(null);
    await refresh();
  }
  async function allowance(token: Address, amount: bigint) {
    const w = await wallet();
    if (
      (await client.readContract({
        address: token,
        abi: tokenAbi,
        functionName: "allowance",
        args: [account!, signedDeskAddress],
      })) < amount
    )
      await confirm(
        await w.writeContract({
          address: token,
          abi: tokenAbi,
          functionName: "approve",
          args: [signedDeskAddress, amount],
        }),
      );
  }
  const owner =
    !!account && view?.owner.toLowerCase() === account.toLowerCase();
  return (
    <section className="card signed-desk">
      <div className="card-head">
        <h2>Signed Desk</h2>
        <span className="location">No periodic price writes</span>
      </div>
      <p className="hint">
        The same Stay / Pull / scripted Shift policy, using 15-second signed
        snapshots in the action transaction. This position is separate from the
        submitted and legacy live positions.
      </p>
      <p className="hint">{signedDeskAddress}</p>
      <div className="metrics">
        <div className="metric">
          <span className="metric-label">Available WHYPE</span>
          <strong>{view ? formatEther(view.base) : "—"}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">mUSDC proceeds</span>
          <strong>{view ? formatUnits(view.usdc, 6) : "—"}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Location</span>
          <strong>
            {view
              ? [
                  "Uninitialized",
                  "Quoted",
                  "Pulled",
                  "InTransit",
                  "OnCoreIdle",
                  "Resting",
                ][view.location]
              : "—"}
          </strong>
        </div>
      </div>
      <fieldset disabled={busy}>
        <div className="signed-desk-fields">
          <label>
            WHYPE amount
            <input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setQuote(null);
              }}
              inputMode="decimal"
            />
          </label>
          <label>
            Maximum mUSDC to pay
            <input
              value={maximum}
              onChange={(e) => setMaximum(e.target.value)}
              inputMode="decimal"
            />
          </label>
        </div>
        <div className="actions">
          <button
            className="btn"
            type="button"
            onClick={() =>
              void run(async () => {
                const result = await fetchQuote(1);
                setQuote(result);
                setNotice(
                  "Signed quote ready. Review the price and confirm before it expires.",
                );
              })
            }
          >
            Get signed swap quote
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={
              !quote || now > Number(quote.quote.validUntil) || !view?.open
            }
            onClick={() =>
              void run(async () => {
                if (!quote) throw Error("Request a quote first");
                const max = parseUnits(maximum, 6);
                await allowance(deployments.quote, max);
                if (
                  BigInt(Math.floor(Date.now() / 1000)) > quote.quote.validUntil
                )
                  throw Error(
                    "Quote expired during approval. Request a fresh quote.",
                  );
                const w = await wallet();
                await confirm(
                  await w.writeContract({
                    address: signedDeskAddress,
                    abi: signedDeskAbi,
                    functionName: "swapSigned",
                    args: [quote.quote.size, max, quote.quote, quote.signature],
                  }),
                );
              })
            }
          >
            Swap with signed quote
          </button>
          <button
            className="btn quiet"
            type="button"
            onClick={() => void run(refresh)}
          >
            Refresh position
          </button>
        </div>
        {quote ? (
          <p className="hint">
            Mid:{" "}
            {formatUnits((quote.quote.bidX18 + quote.quote.askX18) / 2n, 18)}{" "}
            mUSDC / HYPE · expires in{" "}
            {Math.max(0, Number(quote.quote.validUntil) - now)}s. LP band and
            slippage checks still apply.
          </p>
        ) : null}
        {owner ? (
          <details>
            <summary>Manage signed inventory</summary>
            <p className="hint">
              Wrap and deposit uses test HYPE from your connected wallet.
              Maximum mUSDC is also the amount used by Withdraw below.
            </p>
            <div className="actions">
              <button
                className="btn"
                type="button"
                onClick={() =>
                  void run(async () => {
                    const w = await wallet(),
                      size = parseEther(amount);
                    await confirm(
                      await w.writeContract({
                        address: deployments.v2.base,
                        abi: tokenAbi,
                        functionName: "deposit",
                        value: size,
                      }),
                    );
                    await allowance(deployments.v2.base, size);
                    const q = await fetchQuote(2);
                    await confirm(
                      await w.writeContract({
                        address: signedDeskAddress,
                        abi: signedDeskAbi,
                        functionName: "depositSigned",
                        args: [size, 0n, q.quote, q.signature],
                      }),
                    );
                  })
                }
              >
                Wrap and deposit
              </button>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  void run(async () => {
                    const w = await wallet();
                    await confirm(
                      await w.writeContract({
                        address: signedDeskAddress,
                        abi: signedDeskAbi,
                        functionName: "setSwapsOpen",
                        args: [!view?.open],
                      }),
                    );
                  })
                }
              >
                {view?.open ? "Close" : "Open"} signed swaps
              </button>
              {[
                { label: "Evaluate signed", action: 3, fn: "evaluateSigned" },
                { label: "Requote signed", action: 4, fn: "requoteSigned" },
                { label: "Shift 25% signed", action: 5, fn: "shiftSigned" },
              ].map((a) => (
                <button
                  key={a.action}
                  className="btn"
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      const w = await wallet();
                      if (a.action === 5)
                        await confirm(
                          await w.writeContract({
                            address: signedDeskAddress,
                            abi: signedDeskAbi,
                            functionName: "setSpotLinked",
                            args: [true],
                          }),
                        );
                      const q = await fetchQuote(a.action);
                      await confirm(
                        await w.writeContract({
                          address: signedDeskAddress,
                          abi: signedDeskAbi,
                          functionName: a.fn as "evaluateSigned",
                          args: [q.quote, q.signature],
                        }),
                      );
                    })
                  }
                >
                  {a.label}
                </button>
              ))}
              <button
                className="btn"
                type="button"
                onClick={() =>
                  void run(async () => {
                    const w = await wallet();
                    await confirm(
                      await w.writeContract({
                        address: signedDeskAddress,
                        abi: signedDeskAbi,
                        functionName: "withdraw",
                        args: [parseEther(amount), parseUnits(maximum, 6)],
                      }),
                    );
                  })
                }
              >
                Withdraw selected amounts
              </button>
              {(["advanceScripted", "returnScripted"] as const).map((fn) => (
                <button
                  key={fn}
                  type="button"
                  className="btn"
                  onClick={() =>
                    void run(async () => {
                      const w = await wallet();
                      await confirm(
                        await w.writeContract({
                          address: signedDeskAddress,
                          abi: signedDeskAbi,
                          functionName: fn,
                        }),
                      );
                    })
                  }
                >
                  {fn === "advanceScripted"
                    ? "Advance scripted leg"
                    : "Return scripted slice"}
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </fieldset>
      <p role="status" className="hint signed-desk-status">
        {notice}
      </p>
    </section>
  );
}
