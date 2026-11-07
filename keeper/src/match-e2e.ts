import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  createWalletClient,
  http,
  keccak256,
  encodeAbiParameters,
  parseEther,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { elysiumTestnet, rpcUrl } from "./chain.ts";
import {
  root,
  deployment,
  sourceClient,
  destClient,
  sourceAddress,
  destAddress,
  sourceAbi,
  destAbi,
} from "./match-runtime.ts";
import { settleOnce } from "./match-execute.ts";
import { positionAbi } from "../../apps/web/src/matchAbi.ts";

const tokenAbi = parseAbi([
  "function mint(address,uint256)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);
const report: { step: string; hash: string }[] = [];
const key = process.env.SHIFT_PRIVATE_KEY as Hex;
if (!key) throw new Error("Testnet deployer key missing");
const owner = privateKeyToAccount(key);
const keyPath = root + "keeper/.match-e2e-keys.json";
const keys = existsSync(keyPath)
  ? JSON.parse(readFileSync(keyPath, "utf8"))
  : { exit: generatePrivateKey(), depositor: generatePrivateKey() };
if (!existsSync(keyPath))
  writeFileSync(keyPath, JSON.stringify(keys), { mode: 0o600 });
const exit = privateKeyToAccount(keys.exit),
  depositor = privateKeyToAccount(keys.depositor);
const parentChain = {
  ...elysiumTestnet,
  id: 998,
  name: "HyperEVM Testnet",
  rpcUrls: { default: { http: ["https://rpc.hyperliquid-testnet.xyz/evm"] } },
};
const childWallet = (account = owner) =>
  createWalletClient({
    account,
    chain: elysiumTestnet,
    transport: http(rpcUrl),
  });
const parentWallet = (account = owner) =>
  createWalletClient({
    account,
    chain: parentChain,
    transport: http(parentChain.rpcUrls.default.http[0]),
  });
async function receipt(
  chain: typeof sourceClient | typeof destClient,
  hash: Hex,
  step: string,
) {
  const r = await chain.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(step + " reverted");
  report.push({ step, hash });
  console.log(step, hash);
  return r;
}
async function retryNonce<T>(send:()=>Promise<T>):Promise<T>{
 for(let attempt=0;;attempt++){
  try{return await send();}catch(error){
   if(attempt>=9||!String(error).toLowerCase().includes("nonce"))throw error;
  }
 }
}
async function main() {
  if (
    (await sourceClient.getChainId()) !== 99801 ||
    (await destClient.getChainId()) !== 998
  )
    throw new Error("Testnet IDs required");
  for (const account of [exit, depositor]) {
    if (
      (await sourceClient.getBalance({ address: account.address })) <
      parseEther(".0005")
    )
      await receipt(
        sourceClient,
        await retryNonce(()=>childWallet().sendTransaction({
          to: account.address,
          value: parseEther(".001"),
        })),
        "fund child gas",
      );
  }
  if (
    (await destClient.getBalance({ address: exit.address })) <
    parseEther(".0001")
  )
    await receipt(
      destClient,
      await parentWallet().sendTransaction({
        to: exit.address,
        value: parseEther(".0002"),
      }),
      "fund exit gas",
    );
  if (
    (await destClient.getBalance({ address: depositor.address })) <
    parseEther(".0025")
  )
    await receipt(
      destClient,
      await parentWallet().sendTransaction({
        to: depositor.address,
        value: parseEther(".0026"),
      }),
      "fund depositor",
    );
  const token = deployment.usdc as Hex,
    position = deployment.lpPosition as Hex;
  await receipt(
    sourceClient,
    await retryNonce(()=>childWallet().writeContract({
      address: token,
      abi: tokenAbi,
      functionName: "mint",
      args: [exit.address, 1000000n],
    })),
    "mint test USDC",
  );
  await receipt(
    sourceClient,
    await childWallet(exit).writeContract({
      address: token,
      abi: tokenAbi,
      functionName: "approve",
      args: [sourceAddress, 1000000n],
    }),
    "approve test USDC",
  );

  for (const scenario of ["success", "refund"]) {
    const secret = ("0x" + randomBytes(32).toString("hex")) as Hex;
    const hash = keccak256(
      encodeAbiParameters([{ type: "bytes32" }], [secret]),
    );
    const block = await sourceClient.getBlock();
    const gap = await sourceClient.readContract({
      address: sourceAddress,
      abi: sourceAbi,
      functionName: "minGap",
    });
    const nonce = await sourceClient.readContract({
      address: position,
      abi: positionAbi,
      functionName: "quoteNonce",
    });
    const expectedBonus = await sourceClient.readContract({
      address: sourceAddress,
      abi: sourceAbi,
      functionName: "previewBonus",
      args: [parseEther(".001")],
    });
    const input = {
      depositor: depositor.address,
      recipient: exit.address,
      usdc: 80000n,
      whype: parseEther(".001"),
      secretHash: hash,
      claimBefore: block.timestamp + (scenario === "success" ? 1200n : 120n),
      refundAfter:
        block.timestamp + (scenario === "success" ? 1200n : 120n) + gap,
      exitUser: exit.address,
      gasElysium: 0n,
      gasHyper: scenario === "refund" ? parseEther(".000001") : 0n,
      quotedAt: block.timestamp,
      direction: 1,
      nonce,
      expectedBonus,
    };
    const id = await sourceClient.readContract({
      address: sourceAddress,
      abi: sourceAbi,
      functionName: "hashFill",
      args: [position, exit.address, input],
    });
    const signature = await owner.signTypedData({
      domain: {
        name: "Shift Match",
        version: "2",
        chainId: 99801,
        verifyingContract: sourceAddress,
      },
      types: { Quote: [{ name: "fillId", type: "bytes32" }] },
      primaryType: "Quote",
      message: { fillId: id },
    });
    const beforeUsdc = await sourceClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [exit.address],
    });
    await receipt(
      sourceClient,
      await childWallet(exit).writeContract({
        address: sourceAddress,
        abi: sourceAbi,
        functionName: "fund",
        args: [position, input, signature],
      }),
      scenario + " fund",
    );
    const lockInput = {
      sourceChainId: 99801n,
      source: sourceAddress,
      position,
      exitUser: exit.address,
      recipient: exit.address,
      usdc: input.usdc,
      whype: input.whype,
      secretHash: hash,
      claimBefore: input.claimBefore,
      refundAfter: input.refundAfter,
      gasElysium: input.gasElysium,
      gasHyper: input.gasHyper,
      quotedAt: input.quotedAt,
      direction: 1,
      nonce,
      expectedBonus,
    };
    if (
      (await destClient.readContract({
        address: destAddress,
        abi: destAbi,
        functionName: "preview",
        args: [lockInput, depositor.address],
      })) !== id
    )
      throw new Error("Cross-chain ID mismatch");
    const due = (input.whype * 9980n) / 10000n;
    await receipt(
      destClient,
      await parentWallet(depositor).writeContract({
        address: destAddress,
        abi: destAbi,
        functionName: "lock",
        args: [lockInput],
        value: due + input.gasHyper,
      }),
      scenario + " lock",
    );
    writeFileSync(
      root + "keeper/.match-e2e-recovery.json",
      JSON.stringify({ id, input, secret }, (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
      { mode: 0o600 },
    );
    if (scenario === "success") {
      await receipt(
        destClient,
        await parentWallet(exit).writeContract({
          address: destAddress,
          abi: destAbi,
          functionName: "claim",
          args: [id, secret],
        }),
        "destination claim",
      );
      await receipt(
        destClient,
        await parentWallet(exit).writeContract({
          address: destAddress,
          abi: destAbi,
          functionName: "take",
        }),
        "destination take",
      );
      const afterClaim = await destClient.getBlockNumber();
      while ((await destClient.getBlockNumber()) < afterClaim + 2n)
        await new Promise((resolve) => setTimeout(resolve, 1000));
      process.env.SHIFT_RELAYER_KEY = keys.exit;
      let settled = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        await settleOnce();
        const fill = await sourceClient.readContract({
          address: sourceAddress,
          abi: sourceAbi,
          functionName: "getFill",
          args: [id],
        });
        if (fill.status === 2) {
          settled = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!settled) throw new Error("Live worker did not settle the fill");
      if (
        (await sourceClient.readContract({
          address: sourceAddress,
          abi: sourceAbi,
          functionName: "nativeCredit",
          args: [depositor.address],
        })) !== 0n
      )
        throw new Error("Worker did not deliver native payout");
      console.log("Live executor settlement and native delivery verified");
    } else {
      console.log(
        "Waiting for real testnet refund deadline",
        String(input.refundAfter),
      );
      while ((await sourceClient.getBlock()).timestamp < input.refundAfter)
        await new Promise((resolve) => setTimeout(resolve, 10000));
      await receipt(
        destClient,
        await parentWallet(depositor).writeContract({
          address: destAddress,
          abi: destAbi,
          functionName: "refund",
          args: [id],
        }),
        "destination refund",
      );
      const credit = await destClient.readContract({
        address: destAddress,
        abi: destAbi,
        functionName: "credit",
        args: [depositor.address],
      });
      if (credit !== due + input.gasHyper)
        throw new Error("Refund omitted gas budget");
      await receipt(
        destClient,
        await parentWallet(depositor).writeContract({
          address: destAddress,
          abi: destAbi,
          functionName: "take",
        }),
        "refund take",
      );
      await receipt(
        sourceClient,
        await retryNonce(()=>childWallet().writeContract({
          address: sourceAddress,
          abi: sourceAbi,
          functionName: "refund",
          args: [id],
        })),
        "source refund",
      );
      if (
        (await sourceClient.readContract({
          address: token,
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [exit.address],
        })) !== beforeUsdc
      )
        throw new Error("USDC refund mismatch");
    }
    writeFileSync(
      root + "deployments/testnet-evidence.json",
      JSON.stringify(
        {
          readAt: new Date().toISOString(),
          source: sourceAddress,
          dest: destAddress,
          scenario,
          transactions: report,
        },
        null,
        2,
      ),
    );
    console.log(scenario, "verified", id);
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message.split("\n")[0] : "e2e failed",
  );
  process.exitCode = 1;
});
