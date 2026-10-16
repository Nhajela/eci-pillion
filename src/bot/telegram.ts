// Thin Telegram Bot API client. fetchImpl is injectable so tests never call Telegram.
export type Button = { text: string; data?: string; url?: string };
export type Out = { to: number; text: string; buttons?: Button[][] };

export type Notifier = {
  dm(msg: Out): Promise<void>;
  announce(text: string): Promise<void>;
};

export function telegram(token: string, fetchImpl: typeof fetch = fetch) {
  return async function call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const body = (await res.json()) as { ok: boolean; result: T; description?: string };
    if (!body.ok) throw new Error(`telegram ${method}: ${body.description ?? res.status}`);
    return body.result;
  };
}

export type Call = ReturnType<typeof telegram>;

export const keyboard = (buttons?: Button[][]) =>
  buttons?.length
    ? {
        inline_keyboard: buttons.map((row) =>
          row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data })),
        ),
      }
    : undefined;

/** The real notifier. Never throws: a failed DM must not undo a ride. */
export function telegramNotifier(call: Call, announceChatId?: string): Notifier {
  return {
    async dm(m) {
      try {
        await call("sendMessage", {
          chat_id: m.to, text: m.text, parse_mode: "HTML", reply_markup: keyboard(m.buttons),
          link_preview_options: { is_disabled: true },
        });
      } catch (e) {
        console.error("dm failed", m.to, (e as Error).message);
      }
    },
    async announce(text) {
      if (!announceChatId) return;
      try {
        await call("sendMessage", { chat_id: announceChatId, text, parse_mode: "HTML" });
      } catch (e) {
        console.error("announce failed", (e as Error).message);
      }
    },
  };
}

/** Collects messages instead of sending them (tests, and when no bot token is set). */
export function memoryNotifier() {
  const dms: Out[] = [];
  const announcements: string[] = [];
  const n: Notifier & { dms: Out[]; announcements: string[] } = {
    dms, announcements,
    async dm(m) { dms.push(m); },
    async announce(t) { announcements.push(t); },
  };
  return n;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
