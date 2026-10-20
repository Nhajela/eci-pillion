import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { plans, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { maxSeats, vehicleEmoji } from "@/lib/kaju";
import { allPlaces, destName, ERRAND, located, placeById, placeName } from "@/lib/places";
import { istHHMM, istTimeToday } from "@/lib/time";
import { balance, history, REASON_LABEL } from "@/services/kaju";
import { claimLogin, magicCode } from "@/services/login";
import { cancelPlan, createPlan, GameError } from "@/services/plans";
import { cancelRide, confirmRide, hopOn, myRides, takeRequest } from "@/services/rides";
import { locate, refuseRequest, stillHere, stopFloat } from "@/services/floats";
import { finishOnboarding, getUser, updateUser, upsertTelegramUser, type TgUser } from "@/services/users";
import { findOrAddPlace, loadPlaces, pinPlace } from "@/services/places";
import { fileReport, type ReportKind } from "@/services/reports";
import { isAdmin, isStaff } from "@/services/roles";
import { esc, gifUrl, send, type Button, type Call, type Gif, type Notifier } from "./telegram";

type Msg = { chat: { id: number; type: string }; from?: TgUser; text?: string; edit_date?: number; location?: { latitude: number; longitude: number; live_period?: number } };
export type Update = {
  message?: Msg;
  edited_message?: Msg;
  callback_query?: { id: string; from: TgUser; data?: string; message?: { chat: { id: number }; message_id: number } };
};

type Wizard = {
  kind: "offer" | "request"; to?: string; from?: string; at?: string; note?: string;
  step: "to" | "from" | "time" | "seats" | "name" | "pin" | "errand";
  naming?: "to" | "from"; // step name/pin: which end of the trip the new place is
  pinFor?: string; // step pin: the new place waiting for a pin
};
type Reporting = { report: ReportKind };
const isWizard = (s: unknown): s is Wizard => Boolean(s && typeof s === "object" && "step" in s);
const isReporting = (s: unknown): s is Reporting => Boolean(s && typeof s === "object" && "report" in s);

const MENU: Button[][] = [
  [{ text: "🛵 I'm going somewhere", data: "menu:offer" }, { text: "🙋 I need a ride", data: "menu:request" }],
  [{ text: "🌴 Float", data: "menu:float" }, { text: "📋 My rides", data: "menu:mine" }],
  [{ text: "🥜 Kaju", data: "menu:kaju" }, { text: "🌐 Open Pillion", data: "menu:web" }],
  [{ text: "🐞 Report a bug", data: "menu:bug" }, { text: "💡 Suggest an idea", data: "menu:feature" }],
];

const MAX_GRID = 14;

// Hubs first, then tonight's events, spots and stays. Anything else: "Somewhere else" and type its name.
const placeGrid = (prefix: string, opts: { skip?: string; errand?: boolean } = {}): Button[][] => {
  const ps = allPlaces().filter((p) => p.id !== opts.skip).slice(0, MAX_GRID);
  const label = (p: (typeof ps)[number]) => (p.kind === "hub" ? `⭐ ${p.name}` : p.kind === "event" ? `🍲 ${p.name}` : p.kind === "stay" ? `🏡 ${p.name}` : p.name);
  const rows: Button[][] = [];
  if (opts.errand) rows.push([{ text: "🧺 Quick errand nearby & back", data: `${prefix}:${ERRAND.id}` }]);
  for (let i = 0; i < ps.length; i += 2) rows.push(ps.slice(i, i + 2).map((p) => ({ text: label(p), data: `${prefix}:${p.id}` })));
  rows.push([{ text: "➕ Somewhere else (type it)", data: `${prefix}:+new` }]);
  return rows;
};

const VEHICLE_BUTTONS: Button[][] = [
  [{ text: "🛵 Scooty", data: "veh:scooty" }, { text: "🏍️ Bike", data: "veh:bike" }, { text: "🚗 Car", data: "veh:car" }],
  [{ text: "🚶 No wheels (hitcher life)", data: "veh:none" }],
];

// only cars get asked; a scooty or bike always has exactly one pillion seat
const seatButtons = (prefix: string): Button[][] => [
  [1, 2, 3].map((s) => ({ text: String(s), data: `${prefix}:${s}` })),
  [4, 5, 6].map((s) => ({ text: String(s), data: `${prefix}:${s}` })),
];

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

async function say(ctx: Ctx, chatId: number, text: string, buttons?: Button[][], gif?: Gif) {
  await send(ctx.call, chatId, text, { buttons, animation: gif ? gifUrl(gif) : undefined });
}

async function webLink(ctx: Ctx, user: User, path = "/home") {
  const code = await magicCode(ctx.db, user.id, ctx.now);
  return `${env.origin()}/api/login/magic?code=${code}&next=${encodeURIComponent(path)}`;
}

async function welcome(ctx: Ctx, chatId: number, user: User) {
  await say(
    ctx, chatId,
    `Hi <b>${esc(user.name)}</b>! 🛵 Welcome to <b>Pillion</b>, where spare back seats find people. (It's a beta: an experiment in sharing rides. /bug tells us when something's off.)\n\n<b>Step 1 of 2:</b> what do you ride?`,
    VEHICLE_BUTTONS, "welcome",
  );
}

async function menu(ctx: Ctx, chatId: number, user: User, lead = "What's the plan?") {
  const k = await balance(ctx.db, user.id);
  await say(ctx, chatId, `${lead}\n<i>You have ${k} kaju.</i>`, MENU);
}

async function startWizard(ctx: Ctx, chatId: number, user: User, kind: Wizard["kind"]) {
  await updateUser(ctx.db, user.id, { botState: { kind, step: "to" } satisfies Wizard });
  await say(
    ctx, chatId,
    kind === "offer" ? `${vehicleEmoji(user.vehicle)} Where are you heading?` : "🙋 Where do you want to go? (A quick errand to a shop nearby and back works too.)",
    placeGrid("w:to", { errand: kind === "request" }),
  );
}

async function finishWizard(ctx: Ctx, chatId: number, user: User, w: Wizard, seats?: number) {
  await updateUser(ctx.db, user.id, { botState: null });
  const { plan, kaju, pinged } = await createPlan(ctx.db, ctx.n, user, { kind: w.kind, fromPlace: w.from!, toPlace: w.to!, departAt: new Date(w.at!), seats, note: w.note }, ctx.now);
  const what = w.kind === "offer"
    ? `${vehicleEmoji(user.vehicle)} heading to <b>${placeName(plan.toPlace)}</b> with ${plan.seats} seat${plan.seats > 1 ? "s" : ""}`
    : plan.toPlace === ERRAND.id ? `looking for <b>${destName(plan.toPlace, plan.note)}</b>` : `looking for a ride to <b>${placeName(plan.toPlace)}</b>`;
  const unpinned = !located(placeById(plan.fromPlace));
  const tail = pinged
    ? `I pinged ${pinged} ${pinged === 1 ? "person" : "people"} who might match. 🤞`
    : `I'll ping you the moment someone matches.${unpinned && plan.kind === "request" ? " (Floaters can't see where that start is yet. A pin helps: name it again under ➕ Somewhere else and drop one.)" : ""}`;
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
    lines.push(`${p.kind === "offer" ? "🛵 Going" : "🙋 Want to go"} to <b>${destName(p.toPlace, p.note)}</b> around ${istHHMM(p.departAt)}${p.kind === "offer" ? ` · ${p.seats} seat(s) free` : ""}`);
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
  "🌴 <b>Float</b>: tap 📎 → <b>Location</b> → <b>Share My Live Location</b>.\n\nWhile it's on, I'll ping you when someone near you needs a ride, and you earn 5 kaju every 15 minutes (7am–11pm).\n\n<b>The deal:</b> floaters say yes. If you turn down (or ignore) a nearby request, you weren't really floating: −10 kaju, the last hour isn't paid, and your float ends. Busy? Just /stop first, no penalty.";

export async function handleUpdate(ctx: Ctx, u: Update) {
  await loadPlaces(ctx.db);
  if (u.callback_query) return onButton(ctx, u.callback_query);
  const m = u.message ?? u.edited_message;
  if (!m?.from || m.chat.type !== "private") return;
  const { user, isNew } = await upsertTelegramUser(ctx.db, m.from);
  const chatId = m.chat.id;
  const text = m.text?.trim() ?? "";

  // bugs and ideas work for anyone, signed up or not: /bug, /error, /feature (request) …, /idea …
  const [cmd0, ...words] = text.split(/\s+/);
  const reportKind = REPORT_CMDS[cmd0?.toLowerCase().replace(/@.*$/, "") ?? ""];
  const startArg = cmd0 === "/start" ? words[0] ?? "" : "";
  if (reportKind || startArg === "bug" || startArg === "feature") {
    const kind = reportKind ?? (startArg as ReportKind);
    const body = (reportKind ? words : []).join(" ").replace(/^request\b[:\s]*/i, "").trim();
    if (!body) {
      await updateUser(ctx.db, user.id, { botState: { report: kind } satisfies Reporting });
      return say(ctx, chatId, kind === "bug" ? "🐞 What went wrong? Tell me in one message (what you tapped, what you expected)." : "💡 What should Pillion do? Tell me in one message.");
    }
    return report(ctx, chatId, user, kind, body);
  }
  if (isReporting(user.botState) && text && !text.startsWith("/")) return report(ctx, chatId, user, user.botState.report, text);

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

  const w = isWizard(user.botState) ? user.botState : null;
  if (m.location && w?.step === "pin" && w.pinFor && !m.edit_date) {
    await pinPlace(ctx.db, w.pinFor, { lat: m.location.latitude, lng: m.location.longitude });
    await say(ctx, chatId, `📍 Pinned <b>${placeName(w.pinFor)}</b> for everyone. Thank you!`);
    return afterNamed(ctx, chatId, user, w, w.pinFor);
  }
  if (m.location) {
    const live = m.location.live_period ?? null;
    const res = await locate(ctx.db, ctx.n, user, { lat: m.location.latitude, lng: m.location.longitude, livePeriod: live }, ctx.now);
    if ("noWheels" in res) return say(ctx, chatId, "Floating is for people with wheels, so you can pick folks up. Got some? Tell me with /wheels.");
    if ("outside" in res && !m.edit_date) return say(ctx, chatId, "That's outside the village map, so it doesn't count as floating. Come back to Mandrem and share again! 🌴");
    if (res.started) {
      await say(ctx, chatId, `🌴 You're floating near <b>${esc(res.near)}</b>${live ? "" : " for the next hour (share a <b>live</b> location to float longer)"}. I'll ping you when someone nearby needs a ride.\n<i>Floaters say yes: turning down a request ends your float and costs 10 kaju. Not free any more? /stop first, no penalty.</i>`, undefined, "float");
    }
    return;
  }

  if (w?.step === "name" && text && !text.startsWith("/")) {
    const { place, added } = await findOrAddPlace(ctx.db, user, text, null);
    if (added) {
      await updateUser(ctx.db, user.id, { botState: { ...w, step: "pin", pinFor: place.id } satisfies Wizard });
      return say(ctx, chatId, `✨ <b>${placeName(place.id)}</b> is new on Pillion. Drop a pin so floaters can find it: 📎 → <b>Location</b> → move the map to the spot → <b>Send selected location</b> (not live).`, [[{ text: "Skip the pin", data: "w:skip" }]]);
    }
    return afterNamed(ctx, chatId, user, w, place.id);
  }
  if (w?.step === "errand" && text && !text.startsWith("/")) {
    return afterErrand(ctx, chatId, user, { ...w, note: text.slice(0, 80) });
  }
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
    case "/wheels": return say(ctx, chatId, "What are you riding these days?", VEHICLE_BUTTONS);
    case "/admin":
    case "/staff": {
      if (!isStaff(user)) return say(ctx, chatId, "That's for the Pillion team. Spotted a problem? /bug tells them. 💛");
      const path = isAdmin(user) ? "/admin" : "/staff";
      return say(ctx, chatId, `Your ${isAdmin(user) ? "admin" : "staff"} dashboard (link works once, for 30 minutes):`, [[{ text: "📊 Open dashboard", url: await webLink(ctx, user, path) }]]);
    }
    case "/help": return say(ctx, chatId, HELP.replace("PILLION_ORIGIN", env.origin()), MENU);
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
  if (w.kind === "offer" && user.vehicle === "car" && user.seats > 1) {
    await updateUser(ctx.db, user.id, { botState: { ...w, step: "seats" } });
    return say(ctx, chatId, "How many seats free?", seatButtons("w:s").map((row) => row.filter((b) => Number(b.data!.split(":")[2]) <= user.seats)));
  }
  return finishWizard(ctx, chatId, user, w, 1);
}

const REPORT_CMDS: Record<string, ReportKind | undefined> = {
  "/bug": "bug", "/error": "bug", "/feature": "feature", "/idea": "feature", "/request": "feature", "/featurerequest": "feature",
};

const HELP = [
  "<b>Pillion</b> (beta: an experiment, thank you for testing!)",
  "/go: I'm going somewhere, with a seat",
  "/ride: I need a ride (or a quick errand and back)",
  "/float: how floating works · /stop: stop floating",
  "/mine: my plans and rides · /kaju: my kaju",
  "/wheels: change vehicle · /name: change name · /web: open the site",
  "/bug what broke · /feature what you wish it did",
  "",
  "The whole explainer: PILLION_ORIGIN/how-it-works",
].join("\n");

async function report(ctx: Ctx, chatId: number, user: User, kind: ReportKind, text: string) {
  if (isReporting(user.botState)) await updateUser(ctx.db, user.id, { botState: null });
  try {
    const r = await fileReport(ctx.db, ctx.n, user, { kind, text, source: "telegram" }, ctx.now);
    return say(ctx, chatId, `${kind === "bug" ? "🐞 Got it, bug" : "💡 Lovely, idea"} #${r.id} is with the team. Pillion is a beta, so this really helps. I'll tell you when it's sorted.`);
  } catch (e) {
    if (e instanceof GameError) return say(ctx, chatId, e.message);
    throw e;
  }
}

/** A place was picked by name (new or known): carry on to the next step. */
async function afterNamed(ctx: Ctx, chatId: number, user: User, w: Wizard, placeId: string) {
  if (w.naming === "from") {
    if (placeId === w.to) return say(ctx, chatId, "That's where you're going! Where are you starting from?", placeGrid("w:from", { skip: w.to }));
    await updateUser(ctx.db, user.id, { botState: { ...w, from: placeId, step: "time", naming: undefined, pinFor: undefined } satisfies Wizard });
    return say(ctx, chatId, "Around when? Tap one, or type a time like <b>4:30pm</b>. (Earlier plans earn more kaju!)", TIME_BUTTONS);
  }
  await updateUser(ctx.db, user.id, { botState: { ...w, to: placeId, step: "from", naming: undefined, pinFor: undefined } satisfies Wizard });
  return say(ctx, chatId, `To <b>${placeName(placeId)}</b>. Starting from?`, placeGrid("w:from", { skip: placeId }));
}

async function afterErrand(ctx: Ctx, chatId: number, user: User, w: Wizard) {
  await updateUser(ctx.db, user.id, { botState: { ...w, step: "from" } satisfies Wizard });
  return say(ctx, chatId, "🧺 Errand and back. Where are you now? A floater nearby picks you up there and drops you back.", placeGrid("w:from"));
}

async function onButton(ctx: Ctx, q: NonNullable<Update["callback_query"]>) {
  const chatId = q.message?.chat.id ?? q.from.id;
  const data = q.data ?? "";
  let toast = "";
  try {
    await loadPlaces(ctx.db);
    const { user } = await upsertTelegramUser(ctx.db, q.from);
    const [a, b, c] = data.split(":");
    if (a !== "veh" && a !== "seats" && !user.onboardedAt) {
      await welcome(ctx, chatId, user);
    } else if (a === "veh") {
      const vehicle = b === "scooty" || b === "bike" || b === "car" ? b : "none";
      const u2 = await updateUser(ctx.db, user.id, { vehicle, seats: Math.min(maxSeats(vehicle), Math.max(1, user.seats)) });
      if (vehicle === "car") await say(ctx, chatId, "🚗 How many free seats do you usually have?", seatButtons("seats"));
      else await onboarded(ctx, chatId, u2);
    } else if (a === "seats") {
      const seats = Math.min(Math.max(1, Number(b) || 1), Math.max(1, maxSeats(user.vehicle)));
      await onboarded(ctx, chatId, await updateUser(ctx.db, user.id, { seats }));
    } else if (a === "menu") {
      if (b === "offer" || b === "request") await startWizard(ctx, chatId, user, b);
      else if (b === "float") await say(ctx, chatId, FLOAT_HELP);
      else if (b === "mine") await mine(ctx, chatId, user);
      else if (b === "kaju") await kajuInfo(ctx, chatId, user);
      else if (b === "later") await menu(ctx, chatId, user, `All set! How it works, in full: ${env.origin()}/how-it-works`);
      else if (b === "web") await say(ctx, chatId, "Here you go (works once, for 30 minutes):", [[{ text: "🌐 Open Pillion", url: await webLink(ctx, user) }]]);
      else if (b === "bug" || b === "feature") {
        await updateUser(ctx.db, user.id, { botState: { report: b } satisfies Reporting });
        await say(ctx, chatId, b === "bug" ? "🐞 What went wrong? Tell me in one message." : "💡 What should Pillion do? Tell me in one message.");
      }
    } else if (a === "w") {
      const w = isWizard(user.botState) ? user.botState : null;
      if (!w) toast = "That plan form expired. Start again from the menu.";
      else if ((b === "to" || b === "from") && c === "+new") {
        await updateUser(ctx.db, user.id, { botState: { ...w, step: "name", naming: b } satisfies Wizard });
        await say(ctx, chatId, "Type the place's name: a stay, a café, a beach shack, anything. (e.g. <b>Banyan stay</b>, <b>the German bakery</b>)");
      } else if (b === "skip" && w.step === "pin" && w.pinFor) {
        await afterNamed(ctx, chatId, user, w, w.pinFor);
      } else if (b === "skip" && w.step === "errand") {
        await afterErrand(ctx, chatId, user, w);
      } else if (b === "to" && c === ERRAND.id) {
        await updateUser(ctx.db, user.id, { botState: { ...w, to: ERRAND.id, step: "errand" } satisfies Wizard });
        await say(ctx, chatId, "🧺 What's the errand? (e.g. <b>pharmacy</b>, <b>ATM</b>, <b>pick up laundry</b>)", [[{ text: "Skip", data: "w:skip" }]]);
      } else if (b === "to") {
        await updateUser(ctx.db, user.id, { botState: { ...w, to: c, step: "from" } });
        await say(ctx, chatId, `To <b>${placeName(c)}</b>. Starting from?`, placeGrid("w:from", { skip: c }));
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
      toast = r.already
        ? "Already sorted, thanks!"
        : r.done
          ? r.capped ? "Ride counted! (You two have had today's kaju for rides together already.)" : "Kaju delivered! 🥜"
          : "Okay, noted. If the other person says it happened, it still counts.";
    } else if (a === "cxr") {
      const r = await cancelRide(ctx.db, ctx.n, user, Number(b), ctx.now);
      toast = r.late ? "Cancelled. −5 kaju (they were counting on you). It's okay, life happens." : "Cancelled, no kaju lost. Thanks for the heads-up!";
    } else if (a === "nope") {
      const r = await refuseRequest(ctx.db, ctx.n, user, Number(b), ctx.now);
      toast = `Float ended. ${r.lost} kaju. Come back when you're free! 🌴`;
    } else if (a === "still") {
      toast = (await stillHere(ctx.db, user, ctx.now)) ? "Great, still floating! 🌴" : "Your float already ended. Share a live location to start again.";
    } else if (a === "stopfloat") {
      const r = await stopFloat(ctx.db, ctx.n, user, ctx.now);
      toast = r ? `Float ended after ${r.minutes} min. +${r.got} kaju.` : "You weren't floating.";
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
  const link = await webLink(ctx, user, "/avatar?welcome=1");
  if (!user.username) {
    await say(ctx, chatId, "Tip: set a Telegram <b>username</b> (Settings → Username) so the people you ride with can message you to sort the pickup.");
  }
  await say(
    ctx,
    chatId,
    `You're in! ${got ? `+${got} kaju. 🥜` : ""}\n\n<b>Step 2 of 2:</b> draw yourself (badly is fine). It's you on the village map and next to your rides. Takes a minute.`,
    [[{ text: "🎨 Draw my avatar", url: link }], [{ text: "Later, show me the menu", data: "menu:later" }]],
  );
}
