import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, decodeEventLog, type Address } from "viem";
import { factoryAbi, sourceAbi, destAbi } from "../../apps/web/src/matchAbi.ts";
import { elysiumTestnet, rpcUrl } from "./chain.ts";

const root = new URL("../../", import.meta.url);
const load = (path: string) =>
  JSON.parse(readFileSync(new URL(path, root), "utf8"));
async function main() {
  const src = load(
    "broadcast/DeployCommunityMatch.s.sol/99801/run-latest.json",
  );
  const dst = load("broadcast/DeployDestMatch.s.sol/998/run-latest.json");
  const source = src.transactions.find(
    (tx: { contractName: string; transactionType: string }) =>
      tx.contractName === "SourceMatch" && tx.transactionType === "CREATE",
  );
  const factory = src.transactions.find(
    (tx: { contractName: string; transactionType: string }) =>
      tx.contractName === "LpFactory" && tx.transactionType === "CREATE",
  );
  const dest = dst.transactions.find(
    (tx: { contractName: string; transactionType: string }) =>
      tx.contractName === "DestMatch" && tx.transactionType === "CREATE",
  );
  if (!source || !factory || !dest) throw new Error("Deployments incomplete");
  let position: Address | undefined;
  for (const receipt of src.receipts ?? []) {
    for (const log of receipt.logs ?? []) {
      if (log.address.toLowerCase() !== factory.contractAddress.toLowerCase())
        continue;
      try {
        const event = decodeEventLog({
          abi: factoryAbi,
          data: log.data,
          topics: log.topics,
        });
        if (event.eventName === "Created") position = event.args.position;
      } catch {}
    }
  }
  if (!position) throw new Error("LP creation receipt missing");
  const child = createPublicClient({
    chain: elysiumTestnet,
    transport: http(rpcUrl),
  });
  const parent = createPublicClient({
    transport: http("https://rpc.hyperliquid-testnet.xyz/evm"),
  });
  for (const [client, address, artifact] of [
    [child, source.contractAddress, "SourceMatch"],
    [parent, dest.contractAddress, "DestMatch"],
  ] as const) {
    const built = load(
      "out/" + artifact + ".sol/" + artifact + ".json",
    ).deployedBytecode;
    const chainCode = await client.getBytecode({ address: address as Address });
    if (!chainCode) throw new Error("Missing deployed code");
    const normalize = (hex: string) => {
      const bytes = Buffer.from(hex.replace(/^0x/, ""), "hex");
      for (const refs of Object.values(built.immutableReferences) as {
        start: number;
        length: number;
      }[][])
        for (const ref of refs)
          bytes.fill(0, ref.start, ref.start + ref.length);
      return bytes.toString("hex");
    };
    if (normalize(chainCode) !== normalize(built.object))
      throw new Error(artifact + " bytecode differs from build");
  }
  const configured = await child.readContract({
    address: source.contractAddress,
    abi: sourceAbi,
    functionName: "destination",
  });
  if (configured.toLowerCase() !== dest.contractAddress.toLowerCase())
    throw new Error("Wrong destination binding");
  if (
    (await parent.readContract({
      address: dest.contractAddress,
      abi: destAbi,
      functionName: "exitFeeBps",
    })) !== 20n
  )
    throw new Error("Wrong fee");
  const sourceReceipt = await child.getTransactionReceipt({
    hash: source.hash,
  });
  const destReceipt = await parent.getTransactionReceipt({ hash: dest.hash });
  const data = {
    version: 2,
    elysiumChainId: 99801,
    hyperChainId: 998,
    sourceMatch: source.contractAddress,
    destMatch: dest.contractAddress,
    lpFactory: factory.contractAddress,
    lpPosition: position,
    sourceBlock: Number(sourceReceipt.blockNumber),
    destBlock: Number(destReceipt.blockNumber),
    whype: "0xCD57F65c2B0e5881CFC2E609F7CD53b746E1F234",
    usdc: "0xf0A6345093eA6f04768B3CfeaBf50b65A9a3F0c9",
    exitFeeBps: 20,
    protocolFeeBps: 5,
    homepage: "landing",
  };
  writeFileSync(
    new URL("deployments/match.json", root),
    JSON.stringify(data, null, 2) + "\n",
  );
  writeFileSync(
    new URL("apps/web/src/matchDeployments.ts", root),
    `import type {Address} from "viem";
import {deployments} from "./deployments";
export const matchDeployments={
 sourceMatch:"${data.sourceMatch}" as Address,destMatch:"${data.destMatch}" as Address,
 factory:"${data.lpFactory}" as Address,position:"${data.lpPosition}" as Address,
 whype:"${data.whype}" as Address,usdc:"${data.usdc}" as Address,faucet:deployments.faucet
} as const;
`,
  );
  console.log(
    "Deployment bytecode and bindings verified",
    data.sourceMatch,
    data.destMatch,
  );
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "record failed");
  process.exitCode = 1;
});
