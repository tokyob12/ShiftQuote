import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { sourceAbi, destAbi } from "../../apps/web/src/matchAbi.ts";
import { elysiumTestnet, rpcUrl } from "./chain.ts";

export { sourceAbi, destAbi };
export const root = fileURLToPath(new URL("../../", import.meta.url));
export const deployment = JSON.parse(
  readFileSync(root + "deployments/match.json", "utf8"),
);
export const sourceAddress = deployment.sourceMatch as Address;
export const destAddress = deployment.destMatch as Address;
export const sourceClient = createPublicClient({
  chain: elysiumTestnet,
  transport: http(rpcUrl),
});
export const destClient = createPublicClient({
  transport: http(
    process.env.SHIFT_MATCH_HYPER_RPC ??
      "https://rpc.hyperliquid-testnet.xyz/evm",
  ),
});
const cachePath = root + "keeper/.match-index.json";
type Index = {
  source: string;
  chain: number;
  through: string;
  hash: Hex | null;
  ids: Hex[];
  times: Record<string, number>;
};
export async function readFills() {
  const height = await sourceClient.getBlockNumber();
  const safe = height > 2n ? height - 2n : 0n;
  let cache: Index = {
    source: sourceAddress,
    chain: 99801,
    through: String(BigInt(deployment.sourceBlock ?? 0) - 1n),
    hash: null,
    ids: [],
    times: {},
  };
  if (existsSync(cachePath)) {
    const old = JSON.parse(readFileSync(cachePath, "utf8")) as Index;
    if (
      old.times &&
      old.source === sourceAddress &&
      old.chain === 99801 &&
      BigInt(old.through) <= safe
    ) {
      if (
        !old.hash ||
        (await sourceClient.getBlock({ blockNumber: BigInt(old.through) }))
          .hash === old.hash
      )
        cache = old;
    }
  }
  for (let start = BigInt(cache.through) + 1n; start <= safe; start += 1000n) {
    const end = start + 999n < safe ? start + 999n : safe;
    const logs = await sourceClient.getContractEvents({
      address: sourceAddress,
      abi: sourceAbi,
      eventName: "Funded",
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs)
      if (log.args.fillId && !cache.ids.includes(log.args.fillId)) {
        cache.ids.push(log.args.fillId);
        cache.times[log.args.fillId] = Number(
          (await sourceClient.getBlock({ blockNumber: log.blockNumber }))
            .timestamp,
        );
      }
  }
  cache.through = String(safe);
  cache.hash = (await sourceClient.getBlock({ blockNumber: safe })).hash;
  saveIndex(cachePath,cache);
  return Promise.all(
    cache.ids.map(async (id) => ({
      id,
      fundedAt: cache.times[id],
      fill: await sourceClient.readContract({
        address: sourceAddress,
        abi: sourceAbi,
        functionName: "getFill",
        args: [id],
      }),
      lock: await destClient.readContract({
        address: destAddress,
        abi: destAbi,
        functionName: "locks",
        args: [id],
      }),
    })),
  );
}
export function shortError(error: unknown) {
  return error instanceof Error
    ? error.message.split("\n")[0].slice(0, 180)
    : "operation failed";
}

const claimPath=root+"keeper/.match-dest-index.json";
type ClaimIndex={dest:string;through:string;hash:Hex|null;claims:Record<Hex,{secret:Hex;block:string}>};
async function retryRpc<T>(action:()=>Promise<T>):Promise<T>{
 for(let attempt=0;;attempt++){
  try{return await action();}catch(error){
   if(attempt>=7)throw error;
   await new Promise(resolve=>setTimeout(resolve,Math.min(1000*2**attempt,10000)));
  }
 }
}
export async function readClaims(){
 const tip=await destClient.getBlockNumber();
 const safe=tip>2n?tip-2n:0n;
 let cache:ClaimIndex={dest:destAddress,through:String(BigInt(deployment.destBlock)-1n),hash:null,claims:{}};
 if(existsSync(claimPath)){
  const old=JSON.parse(readFileSync(claimPath,"utf8")) as ClaimIndex;
  if(old.dest===destAddress && BigInt(old.through)<=safe
    && (!old.hash||(await retryRpc(()=>destClient.getBlock({blockNumber:BigInt(old.through)}))).hash===old.hash))cache=old;
 }
 for(let from=BigInt(cache.through)+1n;from<=safe;from+=50n){
  const to=from+49n<safe?from+49n:safe;
  const logs=await retryRpc(()=>destClient.getContractEvents({address:destAddress,abi:destAbi,eventName:"Claimed",fromBlock:from,toBlock:to}));
  for(const log of logs){
   if(!log.args.fillId||!log.transactionHash)continue;
   const tx=await retryRpc(()=>destClient.getTransaction({hash:log.transactionHash!}));
   const {decodeFunctionData}=await import("viem");
   const call=decodeFunctionData({abi:destAbi,data:tx.input});
   if(call.functionName==="claim"&&call.args[0]===log.args.fillId)cache.claims[log.args.fillId]={secret:call.args[1],block:String(log.blockNumber)};
  }
  cache.through=String(to);
  cache.hash=(await retryRpc(()=>destClient.getBlock({blockNumber:to}))).hash;
  saveIndex(claimPath,cache);
  await new Promise(resolve=>setTimeout(resolve,2500));
 }
 return cache.claims;
}


function saveIndex(path:string,value:unknown){
 const temporary=path+"."+process.pid+".tmp";
 writeFileSync(temporary,JSON.stringify(value));
 renameSync(temporary,path);
}
