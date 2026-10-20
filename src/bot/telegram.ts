// Thin Telegram Bot API client. fetchImpl is injectable so tests never call Telegram.
export type Button = { text: string; data?: string; url?: string };
/** animation: a GIF moment (`gifUrl(...)`), sent with the text as its caption. */
export type Out = { to: number; text: string; buttons?: Button[][]; animation?: string };

export type Notifier = {
  dm(msg: Out): Promise<void>;
  announce(text: string, animation?: string): Promise<void>;
};

export type Gif = "welcome" | "matched" | "kaju" | "float" | "prizes";
/** GIFs live in public/gifs and are served from this site. */
export const gifUrl = (name: Gif) => `${(process.env.PUBLIC_ORIGIN ?? "https://pillion.housefulloflove.com").replace(/\/$/, "")}/gifs/${name}.gif`;

const CAPTION_MAX = 1024;

/** sendAnimation with the text as caption when there's a GIF and the text fits; plain text otherwise, or if Telegram
 *  refuses the GIF. The words always go out. */
export async function send(call: Call, chatId: number | string, text: string, opts: { buttons?: Button[][]; animation?: string } = {}) {
  const reply_markup = keyboard(opts.buttons);
  if (opts.animation && text.length <= CAPTION_MAX) {
    try {
      return await call("sendAnimation", { chat_id: chatId, animation: opts.animation, caption: text, parse_mode: "HTML", reply_markup });
    } catch (e) {
      console.error("sendAnimation failed, sending text only", (e as Error).message);
    }
  }
  return call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", reply_markup, link_preview_options: { is_disabled: true } });
}

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
        await send(call, m.to, m.text, { buttons: m.buttons, animation: m.animation });
      } catch (e) {
        console.error("dm failed", m.to, (e as Error).message);
      }
    },
    async announce(text, animation) {
      if (!announceChatId) return;
      try {
        await send(call, announceChatId, text, { animation });
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
  const gifs: string[] = [];
  const n: Notifier & { dms: Out[]; announcements: string[]; gifs: string[] } = {
    dms, announcements, gifs,
    async dm(m) { dms.push(m); },
    async announce(t, a) { announcements.push(t); if (a) gifs.push(a); },
  };
  return n;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
