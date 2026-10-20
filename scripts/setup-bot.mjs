// Point the bot at this site and set its command menu. Run once per bot token / domain:
//   TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… PUBLIC_ORIGIN=https://pillion.housefulloflove.com node scripts/setup-bot.mjs
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, PUBLIC_ORIGIN: origin } = process.env;
if (!token || !secret || !origin) throw new Error("need TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_ORIGIN");

async function call(method, params) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(params),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`${method}: ${body.description}`);
  return body.result;
}

await call("setWebhook", {
  url: `${origin.replace(/\/$/, "")}/api/telegram`, secret_token: secret,
  allowed_updates: ["message", "edited_message", "callback_query"],
});
await call("setMyCommands", {
  commands: [
    { command: "go", description: "🛵 I'm going somewhere (offer a seat)" },
    { command: "ride", description: "🙋 I need a ride (or a quick errand and back)" },
    { command: "float", description: "🌴 Float: share live location, get pinged" },
    { command: "stop", description: "Stop floating" },
    { command: "mine", description: "📋 My plans and rides" },
    { command: "kaju", description: "🥜 My kaju" },
    { command: "web", description: "🌐 Open Pillion on the web" },
    { command: "name", description: "Change what the village calls you" },
    { command: "wheels", description: "🛵/🚗 Change your vehicle and seats" },
    { command: "bug", description: "🐞 Report a bug (Pillion is a beta)" },
    { command: "feature", description: "💡 Suggest a feature" },
    { command: "help", description: "All the commands" },
  ],
});
await call("setMyDescription", { description: "Pillion (beta): spare scooty and car seats find people across the Edge City village. Post where you're going, hop on, float, earn kaju. An experiment: /bug and /feature reach the team. 🛵🥜" });
const me = await call("getMe", {});
console.log(`@${me.username} → ${origin}/api/telegram (webhook + commands set)`);
