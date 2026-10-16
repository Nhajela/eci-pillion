// One place for configuration. Telegram features stay off until a bot token is set.
export const env = {
  origin: () => (process.env.PUBLIC_ORIGIN ?? "https://pillion.housefulloflove.com").replace(/\/$/, ""),
  botToken: () => process.env.TELEGRAM_BOT_TOKEN ?? "",
  botUsername: () => process.env.TELEGRAM_BOT_USERNAME ?? "",
  webhookSecret: () => process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  sessionSecret: () => process.env.SESSION_SECRET ?? "",
  announceChatId: () => process.env.ANNOUNCE_CHAT_ID || undefined,
  verifyChatIds: () => (process.env.VERIFY_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
};

export const botEnabled = () => Boolean(env.botToken() && env.botUsername());
