import { defineChain } from "viem";

export const elysiumTestnet = defineChain({
  id: 99801,
  name: "Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.elysium.kinetiq.xyz"] } },
  blockExplorers: {
    default: { name: "Elysium", url: "https://elysium.kinetiq.xyz/testnet-explorer" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});

export const rpcUrl = elysiumTestnet.rpcUrls.default.http[0];
