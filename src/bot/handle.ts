import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { plans, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { PLACES, placeName } from "@/lib/places";
import { istHHMM, istTimeToday } from "@/lib/time";
import { balance, history, REASON_LABEL } from "@/services/kaju";
import { claimLogin, magicCode } from "@/services/login";
import { cancelPlan, createPlan, GameError } from "@/services/plans";
import { cancelRide, confirmRide, hopOn, myRides, takeRequest } from "@/services/rides";
import { locate, stopFloat } from "@/services/floats";
import { finishOnboarding, getUser, updateUser, upsertTelegramUser, type TgUser } from "@/services/users";
import { esc, keyboard, type Button, type Call, type Notifier } from "./telegram";

type Msg = { chat: { id: number; type: string }; from?: TgUser; text?: string; location?: { latitude: number; longitude: number; live_period?: number } };
export type Update = {
  message?: Msg;
  edited_message?: Msg;
  callback_query?: { id: string; from: TgUser; data?: string; message?: { chat: { id: number }; message_id: number } };
};

type Wizard = { kind: "offer" | "request"; to?: string; from?: string; at?: string; step: "to" | "from" | "time" | "seats" };

const MENU: Button[][] = [
  [{ text: "🛵 I'm going somewhere", data: "menu:offer" }, { text: "🙋 I need a ride", data: "menu:request" }],
  [{ text: "🌴 Float", data: "menu:float" }, { text: "📋 My rides", data: "menu:mine" }],
  [{ text: "🥜 Kaju", data: "menu:kaju" }, { text: "🌐 Open Pillion", data: "menu:web" }],
];

const placeGrid = (prefix: string, skip?: string): Button[][] => {
  const ps = PLACES.filter((p) => p.id !== skip);
  const rows: Button[][] = [];
  for (let i = 0; i < ps.length; i += 2) rows.push(ps.slice(i, i + 2).map((p) => ({ text: p.name, data: `${prefix}:${p.id}` })));
  return rows;
};

const TIME_BUTTONS: Button[][] = [
  [{ text: "Now", data: "w:t:0" }, { text: "In 30 min", data: "w:t:30" }, { text: "In 1 h", data: "w:t:60" }],
  [{ text: "In 2 h", data: "w:t:120" }, { text: "In 3 h", data: "w:t:180" }, { text: "In 5 h", data: "w:t:300" }],
];

export type Ctx = { db: Db; call: Call; n: Notifier; now: Date };

async function isVillager(call: Call, tgId: number) {
  const chats = env.verifyChatIds();
  if (!chats.length) return true;
  for (const chat of chats) {
    try {
      const m = await call<{ status: string }>("getChatMember", { chat_id: chat, user_id: tgId });
      if (["creator", "administrator", "member", "restricted"].includes(m.status)) return true;
    } catch {
      /* not in that chat, or the bot isn't */
    }
  }
  return false;
}

async function say(ctx: Ctx, chatId: number, text: string, buttons?: Button[][]) {
  await ctx.call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", reply_markup: keyboard(buttons), link_preview_options: { is_disabled: true } });
}

async function webLink(ctx: Ctx, user: User, path = "/home") {
  const code = await magicCode(ctx.db, user.id, ctx.now);
  return `${env.origin()}/api/login/magic?code=${code}&next=${encodeURIComponent(path)}`;
}

async function welcome(ctx: Ctx, chatId: number, user: User) {
  await say(ctx, chatId, `Hi <b>${esc(user.name)}</b>! 🛵 Welcome to <b>Pillion</b>, where spare back seats find people.\n\nFirst: what do you ride?`, [
    [{ text: "🛵 Scooty", data: "veh:scooty" }, { text: "🏍️ Bike", data: "veh:bike" }],
    [{ text: "🚶 No wheels (hitcher life)", data: "veh:none" }],
  ]);
}

async function menu(ctx: Ctx, chatId: number, user: User, lead = "What's the plan?") {
  const k = await balance(ctx.db, user.id);
  await say(ctx, chatId, `${lead}\n<i>You have ${k} kaju.</i>`, MENU);
}

async function startWizard(ctx: Ctx, chatId: number, user: User, kind: Wizard["kind"]) {
  await updateUser(ctx.db, user.id, { botState: { kind, step: "to" } satisfies Wizard });
  await say(ctx, chatId, kind === "offer" ? "🛵 Where are you heading?" : "🙋 Where do you want to go?", placeGrid("w:to"));
}

async function finishWizard(ctx: Ctx, chatId: number, user: User, w: Wizard, seats?: number) {
  await updateUser(ctx.db, user.id, { botState: null });
  const { plan, kaju, pinged } = await createPlan(ctx.db, ctx.n, user, { kind: w.kind, fromPlace: w.from!, toPlace: w.to!, departAt: new Date(w.at!), seats }, ctx.now);
  const what = w.kind === "offer" ? `heading to <b>${placeName(plan.toPlace)}</b> with ${plan.seats} seat${plan.seats > 1 ? "s" : ""}` : `looking for a ride to <b>${placeName(plan.toPlace)}</b>`;
  const tail = pinged ? `I pinged ${pinged} ${pinged === 1 ? "person" : "people"} who might match. 🤞` : "I'll ping you the moment someone matches.";
  await say(ctx, chatId, `Posted! You're ${what} from ${placeName(plan.fromPlace)} around <b>${istHHMM(plan.departAt)}</b>.\n+${kaju} kaju${kaju >= 15 ? " (early bird!)" : ""}. ${tail}`, [
    [{ text: "Cancel this plan", data: `cxp:${plan.id}` }],
  ]);
}

async function mine(ctx: Ctx, chatId: number, user: User) {
  const ps = await ctx.db.select().from(plans).where(and(eq(plans.userId, user.id), inArray(plans.status, ["open", "full"])));
  const rs = await myRides(ctx.db, user.id);
  if (!ps.length && !rs.length) return say(ctx, chatId, "Nothing planned yet. The lanes are wide open.", MENU);
  const rows: Button[][] = [];
  const lines: string[] = [];
  for (const r of rs) {
    const other = await getUser(ctx.db, r.pilotId === user.id ? r.hitcherId : r.pilotId);
    lines.push(`🛵 ${istHHMM(r.departAt)} → <b>${placeName(r.toPlace)}</b> ${r.pilotId === user.id ? "taking" : "with"} ${esc(other?.name ?? "?")}`);
    rows.push([{ text: `Can't make the ${istHHMM(r.departAt)} ride`, data: `cxr:${r.id}` }]);
  }
  for (const p of ps.filter((p) => p.status === "open")) {
    lines.push(`${p.kind === "offer" ? "🛵 Going" : "🙋 Want to go"} to <b>${placeName(p.toPlace)}</b> around ${istHHMM(p.departAt)}${p.kind === "offer" ? ` · ${p.seats} seat(s) free` : ""}`);
    rows.push([{ text: `Cancel ${istHHMM(p.departAt)} → ${placeName(p.toPlace)}`, data: `cxp:${p.id}` }]);
  }
  await say(ctx, chatId, lines.join("\n"), rows);
}

async function kajuInfo(ctx: Ctx, chatId: number, user: User) {
  const k = await balance(ctx.db, user.id);
  const h = await history(ctx.db, user.id, 6);
  const lines = h.map((r) => `${r.amount > 0 ? "+" : ""}${r.amount} · ${REASON_LABEL[r.reason] ?? r.reason}`);
  await say(ctx, chatId, `🥜 <b>${k} kaju</b>\n${lines.join("\n")}\n\nDaily prizes at 9pm. See who's ahead:`, [[{ text: "🏆 Today", url: `${env.origin()}/today` }]]);
}

const FLOAT_HELP =
  "🌴 <b>Float</b>: tap 📎 → <b>Location</b> → <b>Share My Live Location</b> (pick 8 hours if you like).\n\nWhile it's on, I'll ping you when someone near you needs a ride. You earn 5 kaju every 15 minutes, just for being around. Stop any time with /stop.";

export async function handleUpdate(ctx: Ctx, u: Update) {
  if (u.callback_query) return onButton(ctx, u.callback_query);
  const m = u.message ?? u.edited_message;
  if (!m?.from || m.chat.type !== "private") return;
  const { user, isNew } = await upsertTelegramUser(ctx.db, m.from);
  const chatId = m.chat.id;
  const text = m.text?.trim() ?? "";

  if (isNew || !user.onboardedAt) {
    if (!(await isVillager(ctx.call, m.from.id))) {
      return say(ctx, chatId, "Pillion is for Edge City village members. Join the village Telegram group first, then say /start again. 💛");
    }
  }

  if (text.startsWith("/start")) {
    const arg = text.split(/\s+/)[1] ?? "";
    if (arg.startsWith("login_")) {
      const ok = await claimLogin(ctx.db, arg.slice(6), user.id, ctx.now);
      await say(ctx, chatId, ok ? "✅ You're logged in. Head back to your browser." : "That login link expired. Tap Log in on the site again.");
    }
    if (!user.onboardedAt) return welcome(ctx, chatId, user);
    if (!arg) return menu(ctx, chatId, user, `Welcome back, ${esc(user.name)}!`);
    return;
  }
  if (!user.onboardedAt) return welcome(ctx, chatId, user);

  if (m.location) {
    const live = m.location.live_period ?? null;
    const res = await locate(ctx.db, ctx.n, user, { lat: m.location.latitude, lng: m.location.longitude, livePeriod: live }, ctx.now);
    if (res.started) {
      await say(ctx, chatId, `🌴 You're floating near <b>${res.near}</b>${live ? "" : " for the next hour (share a <b>live</b> location to float longer)"}. I'll ping you when someone nearby needs a ride. /stop to stop.`);
    }
    return;
  }

  const w = user.botState as Wizard | null;
  if (w?.step === "time" && text && !text.startsWith("/")) {
    const t = istTimeToday(text, ctx.now);
    if (!t) return say(ctx, chatId, "I didn't catch that time. Try <b>4:30pm</b> or <b>16:30</b>.", TIME_BUTTONS);
    return afterTime(ctx, chatId, user, { ...w, at: t.toISOString() });
  }

  const [cmd, ...rest] = text.split(/\s+/);
  switch (cmd) {
    case "/go": return startWizard(ctx, chatId, user, "offer");
    case "/ride": return startWizard(ctx, chatId, user, "request");
    case "/float": return say(ctx, chatId, FLOAT_HELP);
    case "/stop": {
      const r = await stopFloat(ctx.db, ctx.n, user, ctx.now);
      return say(ctx, chatId, r ? `Float ended after ${r.minutes} min. +${r.got} kaju. 🌅` : "You weren't floating. Share a live location to start.");
    }
    case "/mine": return mine(ctx, chatId, user);
    case "/kaju": return kajuInfo(ctx, chatId, user);
    case "/web": return say(ctx, chatId, "Your Pillion on the web (link works once, for 30 minutes):", [[{ text: "🌐 Open Pillion", url: await webLink(ctx, user) }]]);
    case "/name": {
      const name = rest.join(" ").trim().slice(0, 32);
      if (!name) return say(ctx, chatId, "Send <b>/name</b> followed by what the village should call you.");
      await updateUser(ctx.db, user.id, { name });
      return say(ctx, chatId, `Hello, <b>${esc(name)}</b>! ✨`);
    }
    default: return menu(ctx, chatId, user);
  }
}

async function afterTime(ctx: Ctx, chatId: number, user: User, w: Wizard) {
  if (w.kind === "offer" && user.seats > 1) {
    await updateUser(ctx.db, user.id, { botState: { ...w, step: "seats" } });
    return say(ctx, chatId, "How many seats free?", [[1, 2, 3].map((s) => ({ text: String(s), data: `w:s:${s}` }))]);
  }
  return finishWizard(ctx, chatId, user, w, Math.max(1, user.seats));
}

async function onButton(ctx: Ctx, q: NonNullable<Update["callback_query"]>) {
  const chatId = q.message?.chat.id ?? q.from.id;
  const data = q.data ?? "";
  let toast = "";
  try {
    const { user } = await upsertTelegramUser(ctx.db, q.from);
    const [a, b, c] = data.split(":");
    if (a !== "veh" && a !== "seats" && !user.onboardedAt) {
      await welcome(ctx, chatId, user);
    } else if (a === "veh") {
      const vehicle = b === "scooty" || b === "bike" ? b : "none";
      const u2 = await updateUser(ctx.db, user.id, { vehicle, seats: vehicle === "none" ? 0 : user.seats || 1 });
      if (vehicle === "none") await onboarded(ctx, chatId, u2);
      else await say(ctx, chatId, "How many people can you usually carry?", [[{ text: "1 pillion", data: "seats:1" }, { text: "2 (it's a big scooty)", data: "seats:2" }]]);
    } else if (a === "seats") {
      await onboarded(ctx, chatId, await updateUser(ctx.db, user.id, { seats: b === "2" ? 2 : 1 }));
    } else if (a === "menu") {
      if (b === "offer" || b === "request") await startWizard(ctx, chatId, user, b);
      else if (b === "float") await say(ctx, chatId, FLOAT_HELP);
      else if (b === "mine") await mine(ctx, chatId, user);
      else if (b === "kaju") await kajuInfo(ctx, chatId, user);
      else if (b === "web") await say(ctx, chatId, "Here you go (works once, for 30 minutes):", [[{ text: "🌐 Open Pillion", url: await webLink(ctx, user) }]]);
    } else if (a === "w") {
      const w = user.botState as Wizard | null;
      if (!w) toast = "That plan form expired. Start again from the menu.";
      else if (b === "to") {
        await updateUser(ctx.db, user.id, { botState: { ...w, to: c, step: "from" } });
        await say(ctx, chatId, `To <b>${placeName(c)}</b>. Starting from?`, placeGrid("w:from", c));
      } else if (b === "from") {
        await updateUser(ctx.db, user.id, { botState: { ...w, from: c, step: "time" } });
        await say(ctx, chatId, "Around when? Tap one, or type a time like <b>4:30pm</b>. (Earlier plans earn more kaju!)", TIME_BUTTONS);
      } else if (b === "t") {
        await afterTime(ctx, chatId, user, { ...w, at: new Date(ctx.now.getTime() + Number(c) * 60_000).toISOString() });
      } else if (b === "s") {
        await finishWizard(ctx, chatId, user, w, Number(c));
      }
    } else if (a === "take") {
      const r = await takeRequest(ctx.db, ctx.n, user, Number(b), ctx.now);
      toast = `You're taking them to ${placeName(r.toPlace)}! 🛵`;
    } else if (a === "hop") {
      const r = await hopOn(ctx.db, ctx.n, user, Number(b), ctx.now);
      toast = `You're on! ${placeName(r.toPlace)} around ${istHHMM(r.departAt)}.`;
    } else if (a === "done") {
      const r = await confirmRide(ctx.db, ctx.n, user, Number(b), c === "y", ctx.now);
      toast = r.already ? "Already sorted, thanks!" : r.done ? "Kaju delivered! 🥜" : "Okay, marked as not happened. No harm done.";
    } else if (a === "cxr") {
      const r = await cancelRide(ctx.db, ctx.n, user, Number(b), ctx.now);
      toast = r.late ? "Cancelled. −5 kaju (they were counting on you). It's okay, life happens." : "Cancelled, no kaju lost. Thanks for the heads-up!";
    } else if (a === "cxp") {
      await cancelPlan(ctx.db, ctx.n, user, Number(b), ctx.now);
      toast = "Plan cancelled.";
    }
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
    toast = e.message;
  } finally {
    await ctx.call("answerCallbackQuery", { callback_query_id: q.id, text: toast || undefined, show_alert: toast.length > 60 }).catch(() => {});
  }
}

async function onboarded(ctx: Ctx, chatId: number, user: User) {
  const got = await finishOnboarding(ctx.db, user.id, ctx.now);
  const link = await webLink(ctx, user, "/avatar");
  await say(
    ctx,
    chatId,
    `You're in! ${got ? `+${got} kaju. 🥜` : ""}\n\nNext: draw yourself so you can scoot around the village map.`,
    [[{ text: "🎨 Draw my avatar", url: link }]],
  );
  await menu(ctx, chatId, user, "Whenever you're ready:");
}
