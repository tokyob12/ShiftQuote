import { defineChain } from "viem";

export const elysiumTestnet = defineChain({
  id: 99801,
  name: "Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.elysium.kinetiq.xyz"] } },
  blockExplorers: {
    default: { name: "Elysium", url: "https://testnet.elysium.kinetiq.xyz" },
  },
});

// Elysium asks for a provider endpoint (Alchemy, Hypedexer, Chainstack, Quicknode) for steady
// traffic. The shared public RPC is the fallback.
export const rpcUrl = process.env.SHIFT_RPC_URL || elysiumTestnet.rpcUrls.default.http[0];

/** The RPC host without any path, so an API key in the URL is never logged. */
export function rpcLabel(): string {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "custom RPC";
  }
}
