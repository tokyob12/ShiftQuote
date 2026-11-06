import type { Address } from "viem";
import { deployments } from "./deployments";

/** Source is on Elysium. Dest is on HyperEVM. The dest address matches the Elysium mUSDC address because the deployer nonce lined up. They are different contracts on different chains. */
export const matchDeployments = {
  sourceMatch: "0xc22a42A91597D314f4327e0B5283a8E5446618D1" as Address,
  destMatch: "0xf0A6345093eA6f04768B3CfeaBf50b65A9a3F0c9" as Address,
  factory: "0x935320dECc094a8A80ea5AEfA130C640a4f65Eb9" as Address,
  position: "0xD78c771501F83139dEae1A88A6197F12C2bD43c0" as Address,
  whype: deployments.v2.base,
  usdc: deployments.quote,
  faucet: deployments.faucet,
} as const;
