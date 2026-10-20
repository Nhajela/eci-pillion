import { and, asc, gt, isNotNull, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { edgeEvents } from "@/db/schema";
import { looseName } from "@/lib/places";
import { findOrAddPlace, findPlace, loadPlaces } from "./places";

// Today's Edge City events (EdgeOS, read-only key in EDGEOS_KEY) as ride destinations: "the 7pm talk at Riva".

const BASE = "https://api.edgeos.world/api/v1";
const WINDOW_H = 36;

type EosEvent = {
  id: string; title: string; start_time: string; end_time: string; venue_id: string | null;
  custom_location_name: string | null; visibility: string; status?: string;
};
type EosVenue = { id: string; title: string };
type Fetch = typeof fetch;

export const eventsEnabled = () => Boolean(process.env.EDGEOS_KEY);

async function get<T>(f: Fetch, path: string, query: Record<string, string>): Promise<T> {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  const r = await f(u, { headers: { Authorization: `Bearer ${process.env.EDGEOS_KEY}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`EdgeOS ${path}: ${r.status}`);
  return (await r.json()) as T;
}

/** Venue texts that aren't a place you can ride to. */
const NOT_A_PLACE = /\b(tbd|tba|to be (disclosed|announced|confirmed)|after (luma )?registration|remote|online|zoom|virtual|google meet|dm (me|for)|secret)\b/i;

/**
 * A ride destination from an EdgeOS venue: "Riva: Garden Oasis" → Riva; anything at the Circle.Work or Cuebebar
 * (where the Circle is) → the Circle; "Aqua0 Residency 2nd floor right above kicks coffee" → "Aqua0 Residency";
 * "TBD after Luma registration" → null.
 */
export function venueToName(venue: string): string | null {
  if (NOT_A_PLACE.test(venue) || /https?:|www\./i.test(venue)) return null;
  const site = venue.split(":")[0].trim();
  const l = looseName(site);
  if (l.includes("riva")) return "Riva";
  if (l.includes("circle") || l.includes("cuebebar")) return "the Circle";
  const name = site
    .split(/\s*[(,–-]\s*|\s+\d+(st|nd|rd|th)\s+floor\b|\s+(right |just )?(above|below|behind|next to|opposite|near)\s+/i)[0]
    .trim();
  return name.length >= 3 ? name.slice(0, 40) : null;
}

/** Pull the next 36 hours of published public events and remember which place each one is at. */
export async function syncEvents(db: Db, now: Date, f: Fetch = fetch) {
  if (!eventsEnabled()) return 0;
  const popups = await get<{ id: string; slug: string; name: string }[]>(f, "/popups/portal/list", {});
  const popup = popups.find((p) => /india/i.test(`${p.slug} ${p.name}`)) ?? popups[0];
  if (!popup) return 0;
  const [events, venues] = await Promise.all([
    get<{ results: EosEvent[] }>(f, "/events/portal/events", {
      popup_id: popup.id, event_status: "published", limit: "100",
      start_after: new Date(now.getTime() - 3600_000).toISOString(), start_before: new Date(now.getTime() + WINDOW_H * 3600_000).toISOString(),
    }),
    get<{ results: EosVenue[] }>(f, "/event-venues/portal/venues", { popup_id: popup.id, limit: "100" }),
  ]);
  await loadPlaces(db);
  let n = 0;
  for (const e of events.results) {
    if (e.visibility !== "public") continue;
    const venue = (e.venue_id ? venues.results.find((v) => v.id === e.venue_id)?.title : e.custom_location_name) ?? null;
    let placeId: string | null = null;
    const name = venue ? venueToName(venue) : null;
    if (name) placeId = (findPlace(name) ?? (await findOrAddPlace(db, null, name, null, "spot")).place).id;
    const row = { title: e.title.replace(/[<>&]/g, "").slice(0, 120), startAt: new Date(e.start_time), endAt: new Date(e.end_time), venue, placeId, syncedAt: now };
    await db.insert(edgeEvents).values({ id: e.id, ...row }).onConflictDoUpdate({ target: edgeEvents.id, set: row });
    n++;
  }
  // events that moved out of the window or were cancelled stop showing once they're stale
  await db.delete(edgeEvents).where(lt(edgeEvents.syncedAt, new Date(now.getTime() - 2 * 3600_000)));
  return n;
}

/** Events you could ride to: starting from now (or started < 30 min ago) within `hours`, at a known place. */
export async function upcomingEvents(db: Db, now: Date, hours = 12) {
  return db
    .select()
    .from(edgeEvents)
    .where(and(isNotNull(edgeEvents.placeId), gt(edgeEvents.startAt, new Date(now.getTime() - 30 * 60_000)), lt(edgeEvents.startAt, new Date(now.getTime() + hours * 3600_000))))
    .orderBy(asc(edgeEvents.startAt))
    .limit(20);
}

/** When to leave for an event: 15 minutes before it starts (or now, if that's passed). */
export const leaveFor = (startAt: Date, now: Date) => new Date(Math.max(now.getTime(), startAt.getTime() - 15 * 60_000));
