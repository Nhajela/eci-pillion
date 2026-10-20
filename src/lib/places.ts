// Village places. The seeds below are built in (Circle, Riva and Nanu are the shuttle team's surveyed spots; the rest
// are approximate); everything else lives in the `places` table: people add stays, cafés and tonight's dinner by
// naming them, admins rename, hide or promote them. services/places.ts keeps this module's list fresh.
export type PlaceKind = "hub" | "spot" | "stay" | "event";
export type Place = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  kind: PlaceKind;
  hidden?: boolean;
  note?: string | null;
  mergedInto?: string | null;
  map?: { x: number; y: number }; // spot on the toy village map
};
export type Located = Place & { lat: number; lng: number };

export const SEED_PLACES: Place[] = [
  { id: "riva", name: "Riva", lat: 15.671151, lng: 73.710554, kind: "hub", map: { x: 880, y: 120 } },
  { id: "circle", name: "the Circle", lat: 15.650722, lng: 73.716417, kind: "hub", map: { x: 470, y: 230 } },
  { id: "arambol", name: "Arambol", lat: 15.6869, lng: 73.704, kind: "spot", map: { x: 120, y: 90 } },
  { id: "nanu", name: "Nanu", lat: 15.680278, lng: 73.710722, kind: "spot", map: { x: 300, y: 150 } },
  { id: "mandrem-beach", name: "Mandrem beach", lat: 15.6635, lng: 73.7085, kind: "spot", map: { x: 160, y: 330 } },
  { id: "market", name: "Mandrem market", lat: 15.6585, lng: 73.7265, kind: "spot", map: { x: 650, y: 335 } },
  { id: "ashwem", name: "Ashwem", lat: 15.6445, lng: 73.717, kind: "spot", map: { x: 300, y: 500 } },
  { id: "morjim", name: "Morjim", lat: 15.623, lng: 73.729, kind: "spot", map: { x: 860, y: 470 } },
  { id: "siolim", name: "Siolim", lat: 15.615, lng: 73.765, kind: "spot", map: { x: 680, y: 560 } },
  { id: "mapusa", name: "Mapusa", lat: 15.5915, lng: 73.809, kind: "spot", map: { x: 930, y: 560 } },
  // where it is changes; admins set tonight's pin and note from the dashboard
  { id: "community-dinner", name: "Community dinner", lat: null, lng: null, kind: "event" },
];
/** Kept for the toy map and older imports: the built-in places that have a spot on the map. */
export const PLACES = SEED_PLACES.filter((p) => p.map) as (Located & { map: { x: number; y: number } })[];

/** "Pop to a shop nearby and come back": a request's destination, not a real place. Starts and ends at `from`. */
export const ERRAND: Place = { id: "errand", name: "a quick errand and back", lat: null, lng: null, kind: "spot" };

/** "Somewhere ~5 km from the pickup, I'll say where": a destination left open, with how far it is. */
export const OPEN: Place = { id: "open", name: "somewhere open", lat: null, lng: null, kind: "spot" };
export const RANGES_KM = [2, 5, 10, 15] as const;

/** Where a plan is headed, for people: "Arambol", "a quick errand and back (pharmacy)", "somewhere ~5 km away". */
export function destName(toPlace: string, note?: string | null, rangeKm?: number | null) {
  if (toPlace === OPEN.id) return `somewhere ~${rangeKm ?? "?"} km away${note ? ` (${note})` : ""}`;
  return note ? `${toPlace === ERRAND.id ? ERRAND.name : placeName(toPlace)} (${note})` : placeName(toPlace);
}

// Village roads wind: straight-line distance × 1.35, at a scooty's ~25 km/h.
const ROAD_FACTOR = 1.35;
const SPEED_KMH = 25;
export const minutesFor = (km: number) => Math.max(3, Math.round((km / SPEED_KMH) * 60));
const fmtKm = (km: number) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));

/** Road kilometres between two pinned places, or null. */
export function tripKm(from: string, to: string) {
  const a = placeById(from);
  const b = placeById(to);
  return located(a) && located(b) ? (distanceM(a, b) / 1000) * ROAD_FACTOR : null;
}

/** For the driver: "≈3.2 km · ~8 min", or "up to ~5 km · ~12 min" for an open destination; null if we can't tell. */
export function tripLabel(from: string, to: string, rangeKm?: number | null) {
  if (to === OPEN.id) return rangeKm ? `up to ~${rangeKm} km · ~${minutesFor(rangeKm)} min` : null;
  if (to === ERRAND.id) return null;
  const km = tripKm(from, to);
  return km == null ? null : `≈${fmtKm(km)} km · ~${minutesFor(km)} min`;
}

/** Two pickups close enough for one person to get to the other (same place, or pinned within 1.5 km). */
export const PICKUP_NEAR_M = 1500;
export function pickupNear(a: string, b: string) {
  if (a === b) return true;
  const pa = placeById(a);
  const pb = placeById(b);
  return located(pa) && located(pb) && distanceM(pa, pb) <= PICKUP_NEAR_M;
}

/** Two places this close count as the same destination when matching (a stay next to Riva is Riva). */
export const SAME_PLACE_M = 600;

let current: Place[] = SEED_PLACES;
let popularity = new Map<string, number>();

/** How often each place was a destination lately: the crowd's ranking for pickers. */
export function setPopularity(uses: Map<string, number>) {
  popularity = uses;
}
export const usesOf = (id: string) => popularity.get(id) ?? 0;

/** Replace the list with database rows layered over the seeds (a row with a seed's id overrides it). */
export function setPlaces(rows: Place[]) {
  const byId = new Map(SEED_PLACES.map((p) => [p.id, p]));
  for (const r of rows) byId.set(r.id, { ...byId.get(r.id), ...r, map: byId.get(r.id)?.map });
  current = [...byId.values()];
}

const KIND_ORDER: Record<PlaceKind, number> = { hub: 0, event: 1, spot: 2, stay: 3 };

/** Visible places for pickers: hubs first, then tonight's events, then wherever the village has been going lately
 *  (the crowd's ranking), then spots, then stays. */
export function allPlaces() {
  const seedIdx = (id: string) => {
    const i = SEED_PLACES.findIndex((p) => p.id === id);
    return i < 0 ? 999 : i;
  };
  return current
    .filter((p) => !p.hidden)
    .sort((a, b) => {
      const tier = (p: Place) => (p.kind === "hub" ? 0 : p.kind === "event" ? 1 : 2);
      return tier(a) - tier(b) || (tier(a) === 2 ? usesOf(b.id) - usesOf(a.id) : 0) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || seedIdx(a.id) - seedIdx(b.id) || a.name.localeCompare(b.name);
    });
}

/** Every place, hidden ones too (old plans still need their names). */
export const everyPlace = () => current;

export const placeById = (id: string): Place | undefined => (id === ERRAND.id ? ERRAND : id === OPEN.id ? OPEN : current.find((p) => p.id === id));
export const placeName = (id: string) => placeById(id)?.name ?? id;
export const located = (p: Place | undefined): p is Located => p != null && p.lat != null && p.lng != null;

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function nearestOf<T extends Located>(pt: { lat: number; lng: number }, list: T[]) {
  let best = list[0];
  let bestD = Infinity;
  for (const p of list) {
    const d = distanceM(pt, p);
    if (d < bestD) [best, bestD] = [p, d];
  }
  return { place: best, metres: bestD };
}

/** The closest known place with a pin (for "floating near …" and the village boundary). */
export const nearestPlace = (pt: { lat: number; lng: number }) => nearestOf(pt, current.filter((p) => !p.hidden && located(p)) as Located[]);
/** The closest place drawn on the toy map. */
export const nearestMapPlace = (pt: { lat: number; lng: number }) => nearestOf(pt, PLACES);

/** Same destination? Same id, or both pinned within SAME_PLACE_M of each other. */
export function samePlace(a: string, b: string) {
  if (a === b) return true;
  if (a === ERRAND.id || b === ERRAND.id || a === OPEN.id || b === OPEN.id) return false;
  const pa = placeById(a);
  const pb = placeById(b);
  return located(pa) && located(pb) && distanceM(pa, pb) <= SAME_PLACE_M;
}

/** A tidy id for a new place name: "Banyan Tree Stay!" → "banyan-tree-stay". */
export const slugify = (name: string) =>
  name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 40) || "place";

/** Compare names loosely: case, spaces and "the" don't matter. */
export const looseName = (name: string) => name.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
