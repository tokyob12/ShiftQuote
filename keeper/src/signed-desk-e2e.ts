import { readFileSync, writeFileSync } from "node:fs";
import { createWalletClient, http, parseAbi, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sourceClient, root, deployment } from "./match-runtime.ts";
import { elysiumTestnet, rpcUrl } from "./chain.ts";
import {
  signedDeskAddress,
  signedDeskAbi,
  decodeDeskQuote,
} from "../../apps/web/src/signedDesk.ts";
const tokenAbi = parseAbi([
  "function deposit() payable",
  "function approve(address,uint256) returns(bool)",
  "function mint(address,uint256)",
  "function balanceOf(address) view returns(uint256)",
]);
async function main() {
  if (!process.env.SHIFT_PRIVATE_KEY)
    throw Error("Load testnet environment first");
  const owner = privateKeyToAccount(process.env.SHIFT_PRIVATE_KEY as Hex),
    keys = JSON.parse(
      readFileSync(root + "keeper/.match-e2e-keys.json", "utf8"),
    ),
    buyer = privateKeyToAccount(keys.exit);
  const wallet = createWalletClient({
      account: owner,
      chain: elysiumTestnet,
      transport: http(rpcUrl),
    }),
    trader = createWalletClient({
      account: buyer,
      chain: elysiumTestnet,
      transport: http(rpcUrl),
    });
  const receipts: { step: string; hash: Hex; gasUsed: string }[] = [];
  async function send(step: string, fn: () => Promise<Hex>) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const hash = await fn();
        const receipt = await sourceClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw Error(step + " reverted");
        receipts.push({ step, hash, gasUsed: String(receipt.gasUsed) });
        console.log(step, hash);
        return;
      } catch (e) {
        if (attempt === 9 || !String(e).toLowerCase().includes("nonce"))
          throw e;
      }
    }
  }
  async function quote(action: number, caller: string, size: string) {
    const response = await fetch("http://127.0.0.1:8787/route-api/desk-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, caller, size }),
    });
    const body = await response.json();
    if (!response.ok) throw Error(body.error);
    return {
      quote: decodeDeskQuote(body.quote),
      signature: body.signature as Hex,
    };
  }
  const [actualOwner, actualSigner] = await Promise.all([
    sourceClient.readContract({
      address: signedDeskAddress,
      abi: signedDeskAbi,
      functionName: "owner",
    }),
    sourceClient.readContract({
      address: signedDeskAddress,
      abi: signedDeskAbi,
      functionName: "quoteSigner",
    }),
  ]);
  if (
    [actualOwner, actualSigner].some(
      (a) => a.toLowerCase() !== owner.address.toLowerCase(),
    )
  )
    throw Error("Submitted owner/signer mismatch");
  const seed = parseEther("0.005"),
    size = parseEther("0.001");
  await send("wrap seed", () =>
    wallet.writeContract({
      address: deployment.whype,
      abi: tokenAbi,
      functionName: "deposit",
      value: seed,
    }),
  );
  await send("approve signed inventory", () =>
    wallet.writeContract({
      address: deployment.whype,
      abi: tokenAbi,
      functionName: "approve",
      args: [signedDeskAddress, seed],
    }),
  );
  let q = await quote(2, owner.address, String(seed));
  await send("deposit with signed snapshot", () =>
    wallet.writeContract({
      address: signedDeskAddress,
      abi: signedDeskAbi,
      functionName: "depositSigned",
      args: [seed, 0n, q.quote, q.signature],
    }),
  );
  await send("open signed swaps", () =>
    wallet.writeContract({
      address: signedDeskAddress,
      abi: signedDeskAbi,
      functionName: "setSwapsOpen",
      args: [true],
    }),
  );
  await send("mint buyer test USDC", () =>
    wallet.writeContract({
      address: deployment.usdc,
      abi: tokenAbi,
      functionName: "mint",
      args: [buyer.address, 2_000_000n],
    }),
  );
  await send("approve buyer USDC", () =>
    trader.writeContract({
      address: deployment.usdc,
      abi: tokenAbi,
      functionName: "approve",
      args: [signedDeskAddress, 1_000_000n],
    }),
  );
  const before = await sourceClient.readContract({
    address: deployment.whype,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [buyer.address],
  });
  q = await quote(1, buyer.address, String(size));
  await send("swap with signed snapshot", () =>
    trader.writeContract({
      address: signedDeskAddress,
      abi: signedDeskAbi,
      functionName: "swapSigned",
      args: [size, 1_000_000n, q.quote, q.signature],
    }),
  );
  const after = await sourceClient.readContract({
    address: deployment.whype,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [buyer.address],
  });
  if (after - before !== size) throw Error("Buyer WHYPE delta mismatch");
  let replayRejected = false;
  try {
    await sourceClient.simulateContract({
      address: signedDeskAddress,
      abi: signedDeskAbi,
      functionName: "swapSigned",
      args: [size, 1_000_000n, q.quote, q.signature],
      account: buyer,
    });
  } catch {
    replayRejected = true;
  }
  if (!replayRejected) throw Error("Replay was accepted");
  writeFileSync(
    root + "deployments/signed-desk-evidence.json",
    JSON.stringify(
      {
        readAt: new Date().toISOString(),
        position: signedDeskAddress,
        owner: owner.address,
        signer: actualSigner,
        checks: [
          "actual signed seed",
          "actual signed swap without posted snapshot",
          "exact buyer WHYPE delta",
          "replay simulation rejected",
        ],
        transactions: receipts,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Signed Desk actual testnet swap passed; no snapshot posting transaction.",
  );
}
void main().catch((e) => {
  console.error(
    e instanceof Error ? e.message.split("\n")[0] : "signed desk test failed",
  );
  process.exitCode = 1;
});
