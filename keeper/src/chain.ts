import { defineChain } from "viem";

export const elysiumTestnet = defineChain({
  id: 99801,
  name: "Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.elysium.kinetiq.xyz"] } },
  blockExplorers: {
    default: { name: "Elysium", url: "https://elysium.kinetiq.xyz/testnet-explorer" },
  },
});
