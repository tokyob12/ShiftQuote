import { parseAbi, type Address, type Hex } from "viem";
export const signedDeskAddress =
  "0x5317ac7e942985c568505c7ae616993c5a659488" as Address;
export const signedDeskAbi = parseAbi([
  "struct Quote {uint8 action;address caller;uint256 size;uint256 bidX18;uint256 askX18;uint256 slippageBps;uint64 coreHeight;uint64 observedAt;uint64 validUntil;uint256 epoch;bytes32 nonce;}",
  "function quoteSigner() view returns(address)",
  "function signerEpoch() view returns(uint256)",
  "function owner() view returns(address)",
  "function base() view returns(address)",
  "function quote() view returns(address)",
  "function elysiumBase() view returns(uint256)",
  "function elysiumQuote() view returns(uint256)",
  "function quotedMidX18() view returns(uint256)",
  "function location() view returns(uint8)",
  "function swapsOpen() view returns(bool)",
  "function setSwapsOpen(bool)",
  "function setSpotLinked(bool)",
  "function withdraw(uint256,uint256)",
  "function advanceScripted()",
  "function returnScripted()",
  "function swapSigned(uint256,uint256,Quote,bytes) returns(bool)",
  "function depositSigned(uint256,uint256,Quote,bytes)",
  "function evaluateSigned(Quote,bytes) returns(uint8)",
  "function requoteSigned(Quote,bytes) returns(uint256)",
  "function shiftSigned(Quote,bytes)",
  "function quoteDigest(Quote) view returns(bytes32)",
]);
export const signedDeskTypes = {
  Quote: [
    { name: "action", type: "uint8" },
    { name: "caller", type: "address" },
    { name: "size", type: "uint256" },
    { name: "bidX18", type: "uint256" },
    { name: "askX18", type: "uint256" },
    { name: "slippageBps", type: "uint256" },
    { name: "coreHeight", type: "uint64" },
    { name: "observedAt", type: "uint64" },
    { name: "validUntil", type: "uint64" },
    { name: "epoch", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;
export type DeskQuote = {
  action: number;
  caller: Address;
  size: bigint;
  bidX18: bigint;
  askX18: bigint;
  slippageBps: bigint;
  coreHeight: bigint;
  observedAt: bigint;
  validUntil: bigint;
  epoch: bigint;
  nonce: Hex;
};
export function decodeDeskQuote(raw: Record<string, string>): DeskQuote {
  return {
    action: Number(raw.action),
    caller: raw.caller as Address,
    size: BigInt(raw.size),
    bidX18: BigInt(raw.bidX18),
    askX18: BigInt(raw.askX18),
    slippageBps: BigInt(raw.slippageBps),
    coreHeight: BigInt(raw.coreHeight),
    observedAt: BigInt(raw.observedAt),
    validUntil: BigInt(raw.validUntil),
    epoch: BigInt(raw.epoch),
    nonce: raw.nonce as Hex,
  };
}
