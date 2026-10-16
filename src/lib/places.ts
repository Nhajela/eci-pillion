// Village spots. Circle, Riva and Nanu are the shuttle team's surveyed spots; the rest are approximate.
export type Place = { id: string; name: string; lat: number; lng: number; map: { x: number; y: number } };

export const PLACES: Place[] = [
  { id: "arambol", name: "Arambol", lat: 15.6869, lng: 73.704, map: { x: 120, y: 90 } },
  { id: "nanu", name: "Nanu", lat: 15.680278, lng: 73.710722, map: { x: 300, y: 150 } },
  { id: "riva", name: "Riva", lat: 15.671151, lng: 73.710554, map: { x: 880, y: 120 } },
  { id: "circle", name: "the Circle", lat: 15.650722, lng: 73.716417, map: { x: 470, y: 230 } },
  { id: "mandrem-beach", name: "Mandrem beach", lat: 15.6635, lng: 73.7085, map: { x: 160, y: 330 } },
  { id: "market", name: "Mandrem market", lat: 15.6585, lng: 73.7265, map: { x: 650, y: 335 } },
  { id: "ashwem", name: "Ashwem", lat: 15.6445, lng: 73.717, map: { x: 300, y: 500 } },
  { id: "morjim", name: "Morjim", lat: 15.623, lng: 73.729, map: { x: 860, y: 470 } },
  { id: "siolim", name: "Siolim", lat: 15.615, lng: 73.765, map: { x: 680, y: 560 } },
  { id: "mapusa", name: "Mapusa", lat: 15.5915, lng: 73.809, map: { x: 930, y: 560 } },
];

export const placeById = (id: string) => PLACES.find((p) => p.id === id);
export const placeName = (id: string) => placeById(id)?.name ?? id;

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function nearestPlace(pt: { lat: number; lng: number }) {
  let best = PLACES[0];
  let bestD = Infinity;
  for (const p of PLACES) {
    const d = distanceM(pt, p);
    if (d < bestD) [best, bestD] = [p, d];
  }
  return { place: best, metres: bestD };
}
