import { chromium } from "playwright-core";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { root } from "./match-runtime.ts";
import { elysiumTestnet } from "./chain.ts";
async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.SHIFT_CHROME_BIN ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const errors: string[] = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 780 },
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of [
      "/",
      "/match",
      "/match/deposit",
      "/match/lp",
      "/match/recovery",
      "/docs/match",
      ...Array.from(
        readFileSync(root + "apps/web/src/Docs.tsx", "utf8").matchAll(
          /href:\s*"(\/docs[^"]*)"/g,
        ),
        (m) => m[1],
      ).filter((route) => route !== "/docs/match"),
    ]) {
      await page.goto("http://127.0.0.1:5180" + route);
      await page.getByRole("heading", { level: 1 }).waitFor();
      console.log(
        "Rendered",
        route,
        await page.getByRole("heading", { level: 1 }).innerText(),
      );
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 780 });
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 2,
          )
        )
          throw new Error("Overflow at " + route + " " + width);
        if (
          process.argv.includes("--screenshots") &&
          (route === "/" || route === "/match")
        ) {
          mkdirSync("/tmp/shift-ui-check", { recursive: true });
          await page.screenshot({
            path:
              "/tmp/shift-ui-check/" +
              (route === "/" ? "home" : "match") +
              "-" +
              width +
              ".png",
            fullPage: false,
          });
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 2,
      )
    )
      throw new Error("Mobile horizontal overflow");
    if (errors.length) throw new Error(errors.join("; "));
    await context.close();
    if (!process.argv.includes("--live")) return;
    if (!process.env.SHIFT_PRIVATE_KEY)
      throw new Error(
        "Load the project .env before running the live wallet test.",
      );
    const keys = JSON.parse(
      readFileSync(root + "keeper/.match-e2e-keys.json", "utf8"),
    );
    const make = async (key: Hex, lpOnly = false) => {
      const account = privateKeyToAccount(key);
      let chainId = 99801;
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on("response", (res) => {
        if (res.status() >= 400)
          console.error("HTTP error", res.status(), res.url().split("?")[0]);
      });
      page.on("requestfailed", (req) =>
        console.error(
          "Network failed",
          req.url().split("?")[0],
          req.failure()?.errorText,
        ),
      );
      page.on("console", (msg) => {
        if (msg.type() === "error")
          console.error("Browser error", msg.text().slice(0, 400));
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.exposeFunction(
        "shiftWalletRpc",
        async (req: { method: string; params?: unknown[] }) => {
          const params = req.params ?? [];
          if (["eth_requestAccounts", "eth_accounts"].includes(req.method))
            return [account.address];
          if (req.method === "eth_chainId") return "0x" + chainId.toString(16);
          if (req.method === "wallet_addEthereumChain") return null;
          if (req.method === "wallet_switchEthereumChain") {
            const next = Number((params[0] as { chainId: string }).chainId);
            if (![998, 99801].includes(next))
              throw new Error("Only testnet chains allowed");
            chainId = next;
            return null;
          }
          if (req.method === "eth_signTypedData_v4") {
            const data = JSON.parse(params[1] as string);
            data.domain.chainId = Number(data.domain.chainId);
            if (
              data.domain.name !== "Shift Match" ||
              data.domain.version !== "2"
            )
              throw new Error("Unexpected signing domain");
            return account.signTypedData(data);
          }
          const url =
            chainId === 99801
              ? "https://testnet-rpc.elysium.kinetiq.xyz"
              : "https://rpc.hyperliquid-testnet.xyz/evm";
          if (req.method === "eth_sendTransaction") {
            if (lpOnly)
              throw new Error("LP test only permits offline quote signatures");
            const tx = params[0] as {
              from: string;
              to: Hex;
              data?: Hex;
              value?: Hex;
            };
            if (tx.from.toLowerCase() !== account.address.toLowerCase())
              throw new Error("Wrong wallet");
            const chain = {
              ...elysiumTestnet,
              id: chainId,
              rpcUrls: { default: { http: [url] } },
            };
            const wallet = createWalletClient({
              account,
              chain,
              transport: http(url),
            });
            return wallet.sendTransaction({
              to: tx.to,
              data: tx.data,
              value: BigInt(tx.value ?? "0"),
            });
          }
          const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: req.method,
              params,
            }),
          });
          const body = await response.json();
          if (body.error) throw new Error(body.error.message);
          return body.result;
        },
      );
      await page.addInitScript({
        content:
          "window.ethereum = { request: function(args) { return window.shiftWalletRpc(args); } };",
      });

      return page;
    };
    const exit = await make(keys.exit),
      lp = await make(process.env.SHIFT_PRIVATE_KEY as Hex, true),
      deposit = await make(keys.depositor);
    await exit.goto("http://127.0.0.1:5180/match");
    await exit.getByText("Advanced quote settings", { exact: true }).click();
    await exit.getByLabel("WHYPE size", { exact: true }).fill("0.001");
    await exit.getByLabel("mUSDC", { exact: true }).fill("0.08");
    await exit
      .getByLabel(/Incoming participant/)
      .fill(privateKeyToAccount(keys.depositor).address);
    await exit
      .getByRole("button", { name: "Request a quote", exact: true })
      .click();
    await exit
      .locator(".match-status")
      .filter({ hasText: "Request ready" })
      .waitFor({ timeout: 30000 });
    await exit
      .getByText("Share or import a public request", { exact: true })
      .click();
    console.log("Reading public request");
    const request = await exit.locator("textarea").inputValue();
    if ("secret" in JSON.parse(request))
      throw new Error("Secret leaked in public request");
    const prepared = JSON.parse(request);
    const privateSecret = await exit.evaluate(
      (id) => sessionStorage.getItem("shift-secret:" + id),
      prepared.fillId,
    );
    writeFileSync(
      root + "keeper/.match-browser-recovery.json",
      JSON.stringify({ request: prepared, secret: privateSecret }),
      { mode: 0o600 },
    );

    console.log("Signing LP quote");
    await lp.goto("http://127.0.0.1:5180/match/lp");
    await lp.locator("textarea").fill(request);
    await lp
      .getByRole("button", { name: "Approve this quote", exact: true })
      .click();
    await lp
      .locator(".match-status")
      .filter({ hasText: "All fill terms signed" })
      .waitFor({ timeout: 120000 });
    const signed = await lp.locator("textarea").inputValue();
    if ("secret" in JSON.parse(signed))
      throw new Error("Secret leaked in signed card");
    console.log("Funding source");
    await exit.locator("textarea").fill(signed);
    await exit
      .getByRole("button", { name: "Reserve USDC for this trade", exact: true })
      .click();
    await exit
      .locator(".match-status")
      .filter({ hasText: "Funded in" })
      .waitFor({ timeout: 120000 });
    console.log("Locking destination");
    await deposit.goto("http://127.0.0.1:5180/match/deposit");
    await deposit.locator("textarea").fill(signed);
    await deposit
      .getByRole("button", { name: /Lock .* HYPE on HyperEVM/, exact: true })
      .click();
    await deposit
      .locator(".match-status")
      .filter({ hasText: "Locked on HyperEVM" })
      .waitFor({ timeout: 120000 });
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log("Claiming destination");
    await exit
      .getByRole("button", { name: "Receive my HYPE", exact: true })
      .click();
    await exit
      .locator(".match-status")
      .filter({ hasText: "Credited HYPE was sent" })
      .waitFor({ timeout: 120000 });
    console.log("Settling source");
    await exit.goto("http://127.0.0.1:5180/match/recovery");
    await exit
      .getByRole("button", { name: "Finish Elysium settlement", exact: true })
      .click();
    await exit
      .locator(".match-status")
      .filter({ hasText: "settle confirmed" })
      .waitFor({ timeout: 120000 });
    if (errors.length) throw new Error(errors.join("; "));
    writeFileSync(
      root + "deployments/browser-evidence.json",
      JSON.stringify(
        {
          readAt: new Date().toISOString(),
          fillId: JSON.parse(signed).fillId,
          checks: [
            "all documentation and primary app routes",
            "desktop and mobile",
            "three-wallet UI settlement",
            "no secret in public cards",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      "Live three-wallet browser flow passed; public cards contain no secret.",
    );
  } catch (error) {
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        const status = await page
          .locator(".match-status")
          .textContent({ timeout: 1000 })
          .catch(() => null);
        if (status) console.error("UI status", status);
      }
    throw error;
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "browser failed");
  process.exitCode = 1;
});
