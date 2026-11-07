import type {Address} from "viem";
import {deployments} from "./deployments";
export const matchDeployments={
 sourceMatch:"0x4ed40397d4c054d265fbe377e83b1063840e7cf7" as Address,destMatch:"0x35578ca58726e86bbfa10526dd7d571923ddd3d9" as Address,
 factory:"0x2b941b3db7e36628fed7eeb4b05c47fdede64cf0" as Address,position:"0x07A0B85399836D0dD154dA2B98381B0164284d00" as Address,
 whype:"0xCD57F65c2B0e5881CFC2E609F7CD53b746E1F234" as Address,usdc:"0xf0A6345093eA6f04768B3CfeaBf50b65A9a3F0c9" as Address,faucet:deployments.faucet
} as const;
