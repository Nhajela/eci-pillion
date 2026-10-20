import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { hearts } from "@/db/schema";
import { currentUser, sameOrigin } from "@/lib/auth";
import { COOKIE } from "@/lib/session";
import { getNotifier } from "@/lib/runtime";
import { istDay, istTimeToday } from "@/lib/time";
import { cancelPlan, createPlan, GameError } from "@/services/plans";
import { cancelRide, confirmRide, hopOn, takeRequest } from "@/services/rides";
import { stopFloat } from "@/services/floats";
import { getUser, updateUser, validAvatar, validColour } from "@/services/users";
import { findOrAddPlace, loadPlaces, parsePin, savePlace } from "@/services/places";
import { fileReport, setReportStatus } from "@/services/reports";
import { requireAdmin, setRole } from "@/services/roles";

// One endpoint for every button on the site. Each action maps to one service call.
const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("plan"), kind: z.enum(["offer", "request"]), from: z.string(), to: z.string(), when: z.string(),
    seats: z.number().int().min(1).max(6).optional(), note: z.string().max(120).optional(),
    // "Somewhere else": a typed place name instead of an id
    fromName: z.string().max(60).optional(), toName: z.string().max(60).optional(),
  }),
  z.object({ action: z.literal("report"), kind: z.enum(["bug", "feature"]), text: z.string().min(1).max(2000), page: z.string().max(200).optional() }),
  z.object({ action: z.literal("setRole"), id: z.number().int(), role: z.enum(["member", "staff", "admin"]) }),
  z.object({ action: z.literal("reportStatus"), id: z.number().int(), status: z.enum(["new", "doing", "done", "wontdo"]) }),
  z.object({
    action: z.literal("savePlace"), id: z.string().max(60), name: z.string().max(60).optional(), kind: z.enum(["hub", "spot", "stay", "event"]).optional(),
    hidden: z.boolean().optional(), note: z.string().max(120).nullable().optional(), pin: z.string().max(300).optional(),
  }),
  z.object({ action: z.literal("addPlace"), name: z.string().min(2).max(60), kind: z.enum(["hub", "spot", "stay", "event"]), pin: z.string().max(300).optional() }),
  z.object({ action: z.literal("cancelPlan"), id: z.number().int() }),
  z.object({ action: z.literal("take"), id: z.number().int() }),
  z.object({ action: z.literal("hop"), id: z.number().int() }),
  z.object({ action: z.literal("cancelRide"), id: z.number().int() }),
  z.object({ action: z.literal("confirm"), id: z.number().int(), happened: z.boolean() }),
  z.object({ action: z.literal("me"), name: z.string().min(1).max(32).optional(), avatar: z.string().optional(), scooty: z.string().optional() }),
  z.object({ action: z.literal("heart"), id: z.number().int() }),
  z.object({ action: z.literal("stopFloat") }),
  z.object({ action: z.literal("logout") }),
]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That didn't make sense to us." }, { status: 400 });
  const b = parsed.data;
  if (b.action === "logout") {
    (await cookies()).delete(COOKIE);
    return NextResponse.json({ ok: true });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const now = new Date();
  const n = getNotifier();
  try {
    await loadPlaces(db());
    switch (b.action) {
      case "report": {
        const r = await fileReport(db(), n, user, { kind: b.kind, text: b.text, source: "web", page: b.page }, now);
        return NextResponse.json({ ok: true, id: r.id });
      }
      case "setRole": await setRole(db(), user, b.id, b.role); break;
      case "reportStatus": await setReportStatus(db(), n, user, b.id, b.status, now); break;
      case "savePlace": {
        const pin = b.pin === undefined ? undefined : b.pin.trim() ? parsePin(b.pin) : null;
        if (pin === null && b.pin?.trim()) throw new GameError("I couldn't read that pin. Paste “15.67, 73.71” or a Google Maps link.");
        await savePlace(db(), user, b.id, { name: b.name, kind: b.kind, hidden: b.hidden, note: b.note, ...(pin !== undefined ? { lat: pin?.lat ?? null, lng: pin?.lng ?? null } : {}) });
        break;
      }
      case "addPlace": {
        requireAdmin(user);
        const pin = b.pin?.trim() ? parsePin(b.pin) : null;
        if (b.pin?.trim() && !pin) throw new GameError("I couldn't read that pin. Paste “15.67, 73.71” or a Google Maps link.");
        const r = await findOrAddPlace(db(), user, b.name, pin, b.kind);
        if (!r.added) throw new GameError(`That's already on the list as “${r.place.name}”.`);
        break;
      }
      case "plan": {
        const departAt = b.when === "now" ? now : /^\+\d+$/.test(b.when) ? new Date(now.getTime() + Number(b.when.slice(1)) * 60_000) : istTimeToday(b.when, now);
        if (!departAt) throw new GameError("Pick a time like 4:30pm.");
        const fromPlace = b.fromName?.trim() ? (await findOrAddPlace(db(), user, b.fromName, null)).place.id : b.from;
        const toPlace = b.toName?.trim() ? (await findOrAddPlace(db(), user, b.toName, null)).place.id : b.to;
        const r = await createPlan(db(), n, user, { kind: b.kind, fromPlace, toPlace, departAt, seats: b.seats, note: b.note }, now);
        return NextResponse.json({ ok: true, kaju: r.kaju, pinged: r.pinged });
      }
      case "cancelPlan": await cancelPlan(db(), n, user, b.id, now); break;
      case "take": await takeRequest(db(), n, user, b.id, now); break;
      case "hop": await hopOn(db(), n, user, b.id, now); break;
      case "cancelRide": return NextResponse.json({ ok: true, ...(await cancelRide(db(), n, user, b.id, now)) });
      case "confirm": await confirmRide(db(), n, user, b.id, b.happened, now); break;
      case "stopFloat": return NextResponse.json({ ok: true, float: await stopFloat(db(), n, user, now) });
      case "me": {
        if (b.avatar !== undefined && !validAvatar(b.avatar)) throw new GameError("That drawing didn't come through. Try again?");
        if (b.scooty !== undefined && !validColour(b.scooty)) throw new GameError("Odd scooty colour.");
        await updateUser(db(), user.id, { ...(b.name ? { name: b.name.trim() } : {}), ...(b.avatar ? { avatar: b.avatar } : {}), ...(b.scooty ? { scooty: b.scooty } : {}) });
        break;
      }
      case "heart": {
        if (b.id === user.id) throw new GameError("Self-love is great, but hearts are for others. 💛");
        const target = await getUser(db(), b.id);
        if (!target?.avatar) throw new GameError("They haven't drawn an avatar yet.");
        await db().insert(hearts).values({ fromId: user.id, toId: b.id, day: istDay(now) }).onConflictDoNothing();
        break;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Something wobbled. Try again?" }, { status: 500 });
  }
}
