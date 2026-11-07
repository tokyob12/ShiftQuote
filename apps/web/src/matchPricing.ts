import { parseUnits } from "viem";
type Level = { px: string; sz: string };
export function marketQuote(
  levels: Level[],
  size: bigint,
  time: number,
  spreadBps = 10n,
  now = Date.now(),
) {
  if (
    size <= 0n ||
    !Number.isFinite(time) ||
    now - time > 15000 ||
    time > now + 5000
  )
    throw new Error("Market snapshot is stale.");
  if (spreadBps < 0n || spreadBps > 1000n)
    throw new Error("Spread out of bounds.");
  let left = size,
    cost = 0n;
  for (const level of levels) {
    const amount = parseUnits(level.sz, 18),
      price = parseUnits(level.px, 18);
    if (amount <= 0n || price <= 0n) throw new Error("Invalid market level.");
    const take = left < amount ? left : amount;
    cost += take * price;
    left -= take;
    if (left === 0n) break;
  }
  if (left !== 0n) throw new Error("Not enough visible depth for this size.");
  // base(18) * price(18) -> USDC(6), rounded up including the LP spread.
  const denominator = 10n ** 30n * 10000n;
  return (cost * (10000n + spreadBps) + denominator - 1n) / denominator;
}

export function baseForBudget(levels:Level[],budget:bigint,time:number,spreadBps=10n,now=Date.now()){
 if(budget<=0n)throw new Error("Enter a positive USDC amount.");
 let low=0n,high=levels.reduce((sum,level)=>sum+parseUnits(level.sz,18),0n);
 if(high===0n || marketQuote(levels,high,time,spreadBps,now)<budget)throw new Error("Not enough visible depth for this USDC amount.");
 while(low<high){
  const middle=(low+high+1n)/2n;
  if(marketQuote(levels,middle,time,spreadBps,now)<=budget)low=middle;
  else high=middle-1n;
 }
 if(low<10n**15n)throw new Error("This amount is below the 0.001 HYPE testnet minimum.");
 return low;
}
