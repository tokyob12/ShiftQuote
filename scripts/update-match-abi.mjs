import {readFileSync,writeFileSync} from "node:fs";
const names={sourceAbi:["SourceMatch","SourceMatch"],destAbi:["DestMatch","DestMatch"],positionAbi:["LpPosition","LpPosition"],factoryAbi:["LpPosition","LpFactory"]};
const content=Object.entries(names).map(([name,[file,contract]])=>{
 const {abi}=JSON.parse(readFileSync(new URL("../out/"+file+".sol/"+contract+".json",import.meta.url),"utf8"));
 return "export const "+name+" = "+JSON.stringify(abi,null,2)+" as const;";
}).join("\n");
writeFileSync(new URL("../apps/web/src/matchAbi.ts",import.meta.url),content+"\n");
