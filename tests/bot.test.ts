import { describe, expect, it } from "vitest";
import { handleUpdate, type Ctx, type Update } from "@/bot/handle";
import { balance } from "@/services/kaju";
import { getByTelegram } from "@/services/users";
import { startLogin, redeemLogin } from "@/services/login";
import { at, notifier, T0, testDb } from "./helpers";

function fakeTelegram() {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const call = (async (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params });
    return method === "getChatMember" ? { status: "member" } : {};
  }) as Ctx["call"];
  const texts = () => calls.filter((c) => c.method === "sendMessage").map((c) => String(c.params.text));
  const buttons = () => calls.filter((c) => c.method === "sendMessage").flatMap((c) => ((c.params.reply_markup as { inline_keyboard?: { callback_data?: string }[][] })?.inline_keyboard ?? []).flat().map((b) => b.callback_data));
  return { call, calls, texts, buttons };
}

const msg = (id: number, text: string): Update => ({ message: { chat: { id, type: "private" }, from: { id, first_name: id === 1 ? "Asha" : "Ben", username: id === 1 ? "asha" : "ben" }, text } });
const tap = (id: number, data: string): Update => ({ callback_query: { id: `q${Math.random()}`, from: { id, first_name: id === 1 ? "Asha" : "Ben" }, data, message: { chat: { id }, message_id: 1 } } });

describe("the bot", () => {
  it("onboards, logs in from the site, and runs the plan wizard to a match", async () => {
    const db = await testDb();
    const tg = fakeTelegram();
    const n = notifier();
    const ctx = (min = 0): Ctx => ({ db, call: tg.call, n, now: at(min) });

    const code = await startLogin(db, T0);
    await handleUpdate(ctx(), msg(1, `/start login_${code}`));
    expect(tg.texts().some((t) => t.includes("logged in"))).toBe(true);
    expect(tg.buttons()).toContain("veh:scooty");
    await handleUpdate(ctx(), tap(1, "veh:scooty"));
    await handleUpdate(ctx(), tap(1, "seats:1"));
    const asha = (await getByTelegram(db, 1))!;
    expect(asha.onboardedAt).not.toBeNull();
    expect(await balance(db, asha.id)).toBe(10);
    expect(await redeemLogin(db, code, at(1))).toBe(asha.id);
    expect(await redeemLogin(db, code, at(1))).toBe("expired");

    // Asha offers a ride to Arambol in 3 hours
    await handleUpdate(ctx(), tap(1, "menu:offer"));
    await handleUpdate(ctx(), tap(1, "w:to:arambol"));
    await handleUpdate(ctx(), tap(1, "w:from:riva"));
    await handleUpdate(ctx(), tap(1, "w:t:180"));
    expect(tg.texts().at(-1)).toContain("+15 kaju");

    // Ben signs up without wheels and asks for Arambol at a typed time
    await handleUpdate(ctx(), msg(2, "/start"));
    await handleUpdate(ctx(), tap(2, "veh:none"));
    await handleUpdate(ctx(), msg(2, "/ride"));
    await handleUpdate(ctx(), tap(2, "w:to:arambol"));
    await handleUpdate(ctx(), tap(2, "w:from:circle"));
    await handleUpdate(ctx(), msg(2, "1:15pm"));
    expect(tg.texts().at(-1)).toContain("1:15pm");
    const ping = n.dms.find((m) => m.to === 1 && m.buttons?.[0][0].data?.startsWith("take:"));
    expect(ping).toBeTruthy();
    await handleUpdate(ctx(5), tap(1, ping!.buttons![0][0].data!));
    expect(n.dms.some((m) => m.to === 2 && m.text.includes("is taking you"))).toBe(true);
    expect(tg.calls.filter((c) => c.method === "answerCallbackQuery").at(-1)!.params.text).toContain("taking them");

    // floating
    await handleUpdate(ctx(10), { message: { chat: { id: 2, type: "private" }, from: { id: 2, first_name: "Ben" }, location: { latitude: 15.645, longitude: 73.717, live_period: 3600 } } });
    expect(tg.texts().at(-1)).toContain("floating near <b>Ashwem</b>");
  });

  it("keeps outsiders out when a village chat is configured", async () => {
    const db = await testDb();
    process.env.VERIFY_CHAT_IDS = "-100123";
    const calls: string[] = [];
    const call = (async (method: string, params: Record<string, unknown>) => {
      calls.push(method === "sendMessage" ? String(params.text) : method);
      if (method === "getChatMember") throw new Error("user not found");
      return {};
    }) as Ctx["call"];
    await handleUpdate({ db, call, n: notifier(), now: T0 }, msg(9, "/start"));
    delete process.env.VERIFY_CHAT_IDS;
    expect(calls.at(-1)).toContain("village members");
  });
});
