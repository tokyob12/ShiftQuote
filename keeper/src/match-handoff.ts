import {readFileSync} from "node:fs";
import {createWalletClient,http,parseAbi,type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {root,sourceClient,sourceAddress,sourceAbi,deployment} from "./match-runtime.ts";
import {positionAbi} from "../../apps/web/src/matchAbi.ts";
import {elysiumTestnet,rpcUrl} from "./chain.ts";
const submitted="0x1329818d4a89a1ea42e9F78c84009A79b8F269f2";
async function main(){
 const technical=privateKeyToAccount(process.env.SHIFT_MATCH_DEPLOY_KEY as Hex);
 const original=privateKeyToAccount(process.env.SHIFT_PRIVATE_KEY as Hex);
 if(original.address.toLowerCase()!==submitted.toLowerCase())throw new Error("Submitted wallet does not match");
 const wallet=createWalletClient({account:process.argv.includes("--recover-seed")?technical:original,chain:elysiumTestnet,transport:http(rpcUrl)});
 const position=deployment.lpPosition as Hex;
 if(process.argv.includes("--recover-seed")){
  const amount=await sourceClient.readContract({address:position,abi:positionAbi,functionName:"available"});
  if(amount>0n){
   let hash=await wallet.writeContract({address:position,abi:positionAbi,functionName:"withdraw",args:[amount,0n]});
   await sourceClient.waitForTransactionReceipt({hash});
   hash=await wallet.writeContract({address:deployment.whype,abi:parseAbi(["function withdraw(uint256)"]),functionName:"withdraw",args:[amount]});
   await sourceClient.waitForTransactionReceipt({hash});console.log("Unreserved testnet seed recovered",String(amount));
  }
  return;
 }
 for(const target of ["source","position"]){
  for(let attempt=0;attempt<10;attempt++){
   try{
    const hash=target==="source"
      ?await wallet.writeContract({address:sourceAddress,abi:sourceAbi,functionName:"acceptAdmin"})
      :await wallet.writeContract({address:position,abi:positionAbi,functionName:"acceptOwnership"});
    const receipt=await sourceClient.waitForTransactionReceipt({hash});
    if(receipt.status!=="success")throw new Error("handoff reverted");
    console.log(target,"ownership accepted",hash);break;
   }catch(error){if(attempt===9 || !String(error).toLowerCase().includes("nonce"))throw error;}
  }
 }
 const [admin,owner,signer,treasury]=await Promise.all([
  sourceClient.readContract({address:sourceAddress,abi:sourceAbi,functionName:"admin"}),
  sourceClient.readContract({address:position,abi:positionAbi,functionName:"owner"}),
  sourceClient.readContract({address:position,abi:positionAbi,functionName:"signer"}),
  sourceClient.readContract({address:sourceAddress,abi:sourceAbi,functionName:"treasury"})
 ]);
 if([admin,owner,signer,treasury].some(a=>a.toLowerCase()!==submitted.toLowerCase()))throw new Error("Wallet ownership mismatch");
 console.log("Admin, LP owner, quote signer and treasury verified",submitted);
}
void main().catch(error=>{console.error(error instanceof Error?error.message.split("\n")[0]:"handoff failed");process.exitCode=1;});
