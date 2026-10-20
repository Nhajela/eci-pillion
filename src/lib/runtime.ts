import { memoryNotifier, telegram, telegramNotifier, type Call, type Notifier } from "@/bot/telegram";
import { db, hasDb } from "@/db";
import { announcements } from "@/db/schema";
import { botEnabled, env } from "./env";

let n: Notifier | null = null;

export function getCall(): Call {
  if (!botEnabled()) return (async () => ({})) as unknown as Call;
  return telegram(env.botToken());
}

/**
 * Real Telegram when a bot token is set; otherwise messages are only logged. Group announcements are always saved
 * (`announcements`) so admins see them on the dashboard; they're posted too only if ANNOUNCE_CHAT_ID is set.
 */
export function getNotifier(): Notifier {
  if (n) return n;
  let base: Notifier;
  if (botEnabled()) base = telegramNotifier(getCall(), env.announceChatId());
  else {
    const mem = memoryNotifier();
    base = {
      dm: async (m) => { console.log("[no bot] dm", m.to, m.text.slice(0, 80)); await mem.dm(m); },
      announce: async (t) => { console.log("[no bot] announce", t.slice(0, 80)); },
    };
  }
  n = {
    dm: base.dm,
    async announce(text, gif) {
      if (hasDb()) {
        await db().insert(announcements).values({ text, gif: gif ?? null, posted: Boolean(botEnabled() && env.announceChatId()) })
          .catch((e) => console.error("saving announcement failed", (e as Error).message));
      }
      await base.announce(text, gif);
    },
  };
  return n;
}
