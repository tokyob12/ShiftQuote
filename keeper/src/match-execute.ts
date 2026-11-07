import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { elysiumTestnet, rpcUrl } from "./chain.ts";
import {
  readFills,
  sourceClient,
  sourceAddress,
  sourceAbi,
  shortError,
  readClaims,
} from "./match-runtime.ts";

export type FillReceipt = {
  fillId: string;
  claimed: boolean;
  settled: boolean;
};
export function pendingSettles(fills: FillReceipt[]) {
  return fills.filter((f) => f.claimed && !f.settled).map((f) => f.fillId);
}
export async function settleOnce() {
  const key = process.env.SHIFT_RELAYER_KEY as Hex | undefined;
  const wallet = key
    ? createWalletClient({
        account: privateKeyToAccount(key),
        chain: elysiumTestnet,
        transport: http(rpcUrl),
      })
    : null;
  console.log("Reading source fills");
  const rows = await readFills();
  console.log("Indexed fills",rows.length);
  const claims=await readClaims();
  for (const row of rows) {
    if(row.fill.status===2 && wallet){
      for(const beneficiary of [row.fill.depositor,wallet.account.address]){
        try{
          const amount=await sourceClient.readContract({address:sourceAddress,abi:sourceAbi,functionName:"nativeCredit",args:[beneficiary]});
          if(amount>0n){
            const hash=await wallet.writeContract({address:sourceAddress,abi:sourceAbi,functionName:"deliver",args:[beneficiary]});
            const receipt=await sourceClient.waitForTransactionReceipt({hash});
            if(receipt.status!=="success")throw new Error("Native delivery reverted");
          }
        }catch(error){console.error("Delivery retry",row.id,shortError(error));}
      }
      continue;
    }
    if (row.fill.status !== 1 || row.lock[6] !== 2) continue;
    const now = await sourceClient.getBlock();
    if (now.timestamp >= row.fill.refundAfter) {
      console.error("CRITICAL: claimed fill passed source timeout", row.id);
      continue;
    }
    const secret=claims[row.id]?.secret;
    if (!secret) continue;
    if (!wallet) {
      console.log("settle ready (dry run)", row.id);
      continue;
    }
    try {
      console.log('Simulating source settlement',row.id);
      const request = await sourceClient.simulateContract({
        address: sourceAddress,
        abi: sourceAbi,
        functionName: "settle",
        args: [row.id, secret],
        account: wallet.account,
      });
      const hash = await wallet.writeContract(request.request);
      const receipt = await sourceClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("settle reverted");
      console.log("settled", row.id, hash);
      for (const beneficiary of [row.fill.depositor, wallet.account.address]) {
        const credit = await sourceClient.readContract({
          address: sourceAddress,
          abi: sourceAbi,
          functionName: "nativeCredit",
          args: [beneficiary],
        });
        if (credit > 0n) {
          const delivery = await wallet.writeContract({
            address: sourceAddress,
            abi: sourceAbi,
            functionName: "deliver",
            args: [beneficiary],
          });
          await sourceClient.waitForTransactionReceipt({ hash: delivery });
        }
      }
    } catch (error) {
      console.error(row.id, shortError(error));
    }
  }
}
async function main() {
  if (process.argv.includes("--self-test")) {
    if (
      pendingSettles([
        { fillId: "a", claimed: true, settled: false },
        { fillId: "b", claimed: false, settled: false },
      ]).join() !== "a"
    )
      throw new Error("selection");
    console.log("match-execute self-test passed");
    return;
  }
  do {
    try {
      await settleOnce();
    } catch (error) {
      console.error(shortError(error));
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
    if (process.argv.includes("--once")) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (true);
}
if (process.argv[1]?.endsWith("match-execute.ts")) void main();
