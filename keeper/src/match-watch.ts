import { readFills, sourceClient, shortError } from "./match-runtime.ts";
async function main() {
  const rows = await readFills();
  const block = await sourceClient.getBlock();
  const problems: string[] = [];
  for (const row of rows) {
    if (row.fill.status === 1 && row.lock[6] === 2)
      problems.push("Destination claimed, source unsettled: " + row.id);
    if (row.fill.status === 1 && row.fill.refundAfter <= block.timestamp + 300n)
      problems.push("Source recovery deadline near: " + row.id);
    if (row.fill.status === 3 && row.lock[6] === 2)
      problems.push(
        "CRITICAL: source refunded after destination claim: " + row.id,
      );
  }
  console.log(
    problems.length
      ? problems.join("\n")
      : "Match healthy: " + rows.length + " indexed fills",
  );
  if (problems.length) {
    const text = problems.join("\n");
    const webhook = process.env.SHIFT_ALERT_WEBHOOK;
    if (webhook) {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, content: text }),
      });
      if (!response.ok) throw new Error("alert rejected");
    }
    const token = process.env.SHIFT_TELEGRAM_TOKEN,
      chat = process.env.SHIFT_TELEGRAM_CHAT_ID;
    if (token && chat) {
      const response = await fetch(
        "https://api.telegram.org/bot" + token + "/sendMessage",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chat, text }),
        },
      );
      if (!response.ok) throw new Error("alert rejected");
    }
    process.exitCode = 1;
  }
}
void main().catch((error) => {
  console.error(shortError(error));
  process.exitCode = 1;
});
