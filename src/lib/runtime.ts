import { memoryNotifier, telegram, telegramNotifier, type Call, type Notifier } from "@/bot/telegram";
import { botEnabled, env } from "./env";

let n: Notifier | null = null;

export function getCall(): Call {
  if (!botEnabled()) return (async () => ({})) as unknown as Call;
  return telegram(env.botToken());
}

/** Real Telegram when a bot token is set; otherwise messages are only logged. */
export function getNotifier(): Notifier {
  if (n) return n;
  if (botEnabled()) n = telegramNotifier(getCall(), env.announceChatId());
  else {
    const mem = memoryNotifier();
    n = {
      dm: async (m) => { console.log("[no bot] dm", m.to, m.text.slice(0, 80)); await mem.dm(m); },
      announce: async (t) => { console.log("[no bot] announce", t.slice(0, 80)); },
    };
  }
  return n;
}
