import { readFileSync, writeFileSync } from "node:fs";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { root, sourceClient, deployment } from "./match-runtime.ts";
import { elysiumTestnet, rpcUrl } from "./chain.ts";
async function main() {
  const key = process.env.SHIFT_MATCH_DEPLOY_KEY as Hex;
  if (!key) throw Error("Testnet technical deploy key required");
  const owner = "0x1329818d4a89a1ea42e9F78c84009A79b8F269f2" as const;
  const artifact = JSON.parse(
    readFileSync(root + "out/SignedPosition.sol/SignedPosition.json", "utf8"),
  );
  const wallet = createWalletClient({
    account: privateKeyToAccount(key),
    chain: elysiumTestnet,
    transport: http(rpcUrl),
  });
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [owner, deployment.whype, deployment.usdc, owner],
  });
  const receipt = await sourceClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress)
    throw Error("Signed Desk deployment failed");
  const address = receipt.contractAddress;
  writeFileSync(
    root + "deployments/signed-desk.json",
    JSON.stringify(
      {
        chainId: 99801,
        position: address,
        owner,
        signer: owner,
        transaction: hash,
        base: deployment.whype,
        quote: deployment.usdc,
      },
      null,
      2,
    ) + "\n",
  );
  const path = root + "apps/web/src/signedDesk.ts";
  writeFileSync(
    path,
    readFileSync(path, "utf8").replace(
      /export const signedDeskAddress="0x[0-9a-fA-F]{40}"/,
      `export const signedDeskAddress="${address}"`,
    ),
  );
  console.log("Signed Desk deployed", address, "owner and signer", owner);
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message.split("\n")[0] : "deploy failed",
  );
  process.exitCode = 1;
});
