// Diagnostic probes. Passing confirms current limitations, not security approval.
import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {privateKeyToAccount,generatePrivateKey} from "viem/accounts";
import {encodeFunctionData,decodeFunctionData,parseAbi,type Address,type Hex} from "viem";
import {RouteBook} from "./route-book.ts";
import {routeMessage,type Offer} from "../../apps/web/src/routeQuote.ts";
import {destAbi} from "../../apps/web/src/matchAbi.ts";
test("review: wrapped claim calldata throws in current indexer decoder",()=>{
 const data=encodeFunctionData({abi:parseAbi(["function forward(address,bytes32,bytes32)"]),functionName:"forward",args:["0x1111111111111111111111111111111111111111","0x"+"12".repeat(32) as Hex,"0x"+"13".repeat(32) as Hex]});
 assert.throws(()=>decodeFunctionData({abi:destAbi,data}));
});
test("review: 5000 expired offers no longer consume the active book cap",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"shift-review-"));try{
 const actor=privateKeyToAccount(generatePrivateKey()),source="0x1111111111111111111111111111111111111111" as Address;
 const book=new RouteBook(join(dir,"book.json"),source,{async lp(){},async balance(){},async status(){return 0;},async card(){}},()=>100000);
 book.data.offers=Array.from({length:5000},(_,i)=>({id:String(i),owner:actor.address,kind:"deposit",position:source,amount:"1",price:"1",expires:1,signature:"0x",auth:{owner:actor.address,nonce:"old-nonce-number-"+i,expires:1}} as Offer));
 const payload={kind:"deposit",position:source,amount:"1000",price:"1",expires:101800},auth={owner:actor.address,nonce:crypto.randomUUID(),expires:100180};
 const signature=await actor.signMessage({message:routeMessage(source,"offer",payload,auth)});
 await book.mutate("offer",payload,auth,signature);
 assert.equal(book.data.offers.length,1);
 assert.equal(book.archive.length,5000);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
