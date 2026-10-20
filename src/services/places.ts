import { eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { places, plans, rides, type User } from "@/db/schema";
import {
  allPlaces, distanceM, everyPlace, setPopularity, located, looseName, nearestPlace, setPlaces, slugify, SEED_PLACES,
  type Place, type PlaceKind,
} from "@/lib/places";
import { VILLAGE_RADIUS_M } from "@/lib/match";
import { GameError } from "./errors";
import { requireAdmin } from "./roles";

const TTL_MS = 20_000;
/** A new pin this close to a known place is that place (two people naming the same stay differently). */
export const DEDUPE_M = 150;

let loadedAt = 0;

/** Refresh the in-memory place list from the database (at most every 20 s unless forced). */
export async function loadPlaces(db: Db, force = false) {
  if (!force && Date.now() - loadedAt < TTL_MS) return allPlaces();
  const [rows, uses] = await Promise.all([
    db.select().from(places),
    // the crowd's ranking: how often each place was a destination this past week
    db.select({ id: plans.toPlace, n: sql<number>`count(*)::int` }).from(plans).where(gt(plans.createdAt, new Date(Date.now() - 7 * 86400_000))).groupBy(plans.toPlace),
  ]);
  setPopularity(new Map(uses.map((u) => [u.id, u.n])));
  setPlaces(rows.map((r) => ({ id: r.id, name: r.name, lat: r.lat, lng: r.lng, kind: r.kind as PlaceKind, hidden: r.hidden || r.mergedInto != null, note: r.note, mergedInto: r.mergedInto })));
  loadedAt = Date.now();
  return allPlaces();
}

/** Tests: forget everything people added. */
export function resetPlaces() {
  setPlaces([]);
  setPopularity(new Map());
  loadedAt = 0;
}

/** Find a place by (loose) name, or by a pin close to a known place. */
export function findPlace(name: string, pin?: { lat: number; lng: number } | null): Place | undefined {
  const n = looseName(name);
  const byName = n ? everyPlace().find((p) => !p.hidden && looseName(p.name) === n) : undefined;
  if (byName) return byName;
  // a name that was merged away still finds the place it was merged into
  const merged = n ? everyPlace().find((p) => p.mergedInto && looseName(p.name) === n) : undefined;
  if (merged) return everyPlace().find((p) => p.id === merged.mergedInto);
  if (pin) {
    const near = nearestPlace(pin);
    if (near.place && near.metres <= DEDUPE_M) return near.place;
  }
  return undefined;
}

/**
 * Someone names a place that isn't on the list ("Banyan stay", "the bakery"). Reuse a match if there is one,
 * otherwise add it for everyone. A pin is optional: without one the place matches by name only.
 */
export async function findOrAddPlace(db: Db, user: User | null, rawName: string, pin?: { lat: number; lng: number } | null, kind: PlaceKind = "spot") {
  const name = cleanName(rawName);
  if (name.length < 2) throw new GameError("Give the place a name, like “Banyan stay” or “the bakery”.");
  if (pin && nearestPlace(pin).metres > VILLAGE_RADIUS_M * 3) throw new GameError("That pin is far from the village. Pillion is for rides around Mandrem.");
  await loadPlaces(db);
  const found = findPlace(name, pin);
  if (found) {
    // first pin for a name-only place: keep it
    if (pin && !located(found)) await pinPlace(db, found.id, pin);
    return { place: found, added: false };
  }
  let id = slugify(name);
  for (let i = 2; everyPlace().some((p) => p.id === id) || id === "errand"; i++) id = `${slugify(name)}-${i}`;
  await db.insert(places).values({ id, name, lat: pin?.lat ?? null, lng: pin?.lng ?? null, kind, addedBy: user?.id ?? null }).onConflictDoNothing();
  await loadPlaces(db, true);
  return { place: everyPlace().find((p) => p.id === id)!, added: true };
}

/** Give a place a pin after the fact (the bot asks right after a new name). */
export async function pinPlace(db: Db, id: string, pin: { lat: number; lng: number }) {
  await upsertRow(db, id, { lat: pin.lat, lng: pin.lng });
  await loadPlaces(db, true);
}

/** Admin: rename, re-pin, hide, change kind or note. Seed places get a row the first time they're edited. */
export async function savePlace(
  db: Db, admin: User, id: string,
  patch: { name?: string; kind?: PlaceKind; hidden?: boolean; note?: string | null; lat?: number | null; lng?: number | null },
) {
  requireAdmin(admin);
  if (patch.name !== undefined && patch.name.trim().length < 2) throw new GameError("Name's too short.");
  if (!everyPlace().some((p) => p.id === id)) await loadPlaces(db, true);
  if (!everyPlace().some((p) => p.id === id)) throw new GameError("No such place.");
  await upsertRow(db, id, { ...patch, name: patch.name === undefined ? undefined : cleanName(patch.name), note: patch.note === undefined ? undefined : cleanName(patch.note ?? "", 120) || null });
  return loadPlaces(db, true);
}

async function upsertRow(db: Db, id: string, patch: Partial<typeof places.$inferInsert>) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const [row] = await db.select().from(places).where(eq(places.id, id));
  if (row) {
    if (Object.keys(clean).length) await db.update(places).set(clean).where(eq(places.id, id));
    return;
  }
  const base = everyPlace().find((p) => p.id === id) ?? SEED_PLACES.find((p) => p.id === id);
  if (!base) throw new GameError("No such place.");
  await db.insert(places).values({ id, name: base.name, lat: base.lat, lng: base.lng, kind: base.kind, hidden: base.hidden ?? false, note: base.note ?? null, ...clean });
}

/** Names go into Telegram HTML everywhere, so they never carry markup. */
export const cleanName = (s: string, max = 40) => s.replace(/[<>&]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Admin: two places turned out to be the same ("Banyan stay" and "Banyan Tree"). Every plan and ride moves to `intoId`,
 * `fromId` disappears from pickers, and its name keeps leading to `intoId`.
 */
export async function mergePlace(db: Db, admin: User, fromId: string, intoId: string) {
  requireAdmin(admin);
  await loadPlaces(db, true);
  const from = everyPlace().find((p) => p.id === fromId);
  const into = everyPlace().find((p) => p.id === intoId);
  if (!from || !into || fromId === intoId) throw new GameError("Pick two different places.");
  if (into.mergedInto) throw new GameError(`${into.name} was itself merged away. Pick the place it went into.`);
  const moved = await db.transaction(async (tx) => {
    const a = await tx.update(plans).set({ fromPlace: intoId }).where(eq(plans.fromPlace, fromId)).returning({ id: plans.id });
    const b = await tx.update(plans).set({ toPlace: intoId }).where(eq(plans.toPlace, fromId)).returning({ id: plans.id });
    const c = await tx.update(rides).set({ fromPlace: intoId }).where(eq(rides.fromPlace, fromId)).returning({ id: rides.id });
    const d = await tx.update(rides).set({ toPlace: intoId }).where(eq(rides.toPlace, fromId)).returning({ id: rides.id });
    // anything merged into `from` before now points straight at `into`
    await tx.update(places).set({ mergedInto: intoId }).where(eq(places.mergedInto, fromId));
    return a.length + b.length + c.length + d.length;
  });
  await upsertRow(db, fromId, { mergedInto: intoId, hidden: true });
  if (!located(into) && located(from)) await upsertRow(db, intoId, { lat: from.lat, lng: from.lng });
  await loadPlaces(db, true);
  return { moved };
}

/** Parse "15.67, 73.71" or a Google Maps link with @lat,lng or ?q=lat,lng. */
export function parsePin(s: string): { lat: number; lng: number } | null {
  const m = s.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export const distanceBetween = (a: Place, b: Place) => (located(a) && located(b) ? distanceM(a, b) : null);
