import type { Float, Plan } from "@/db/schema";
import { distanceM, located, OPEN, pickupNear, placeById, samePlace, tripKm } from "./places";

export const MATCH_WINDOW_MIN = 45;
export const FLOAT_RADIUS_M = 3000;
/** Floating only counts inside the village: within this distance of a village spot. */
export const VILLAGE_RADIUS_M = 4000;

/**
 * Where-to check. Concrete destinations: the same place (or pinned within a few hundred metres).
 * Open destinations ("somewhere ~5 km from the pickup") need pickups near each other, and:
 *  - request open, offer concrete: the pilot is starting near them and hears how far; they decide.
 *  - offer open ("free to drop someone up to N km"): the request's trip fits in N km (if we can measure it).
 *  - both open: the hitcher's range fits in the pilot's.
 * Errands ("pop to a shop and back") are for floaters, never offers.
 */
export function destinationsFit(offer: Pick<Plan, "fromPlace" | "toPlace" | "rangeKm">, request: Pick<Plan, "fromPlace" | "toPlace" | "rangeKm">) {
  const offerOpen = offer.toPlace === OPEN.id;
  const reqOpen = request.toPlace === OPEN.id;
  if (!offerOpen && !reqOpen) return samePlace(offer.toPlace, request.toPlace);
  if (!pickupNear(offer.fromPlace, request.fromPlace)) return false;
  if (reqOpen && !offerOpen) return true;
  if (offerOpen && !reqOpen) {
    const km = tripKm(request.fromPlace, request.toPlace);
    return km == null || km <= (offer.rangeKm ?? 0) + 0.5;
  }
  return (request.rangeKm ?? 0) <= (offer.rangeKm ?? 0);
}

/** Does this offer suit this request? Destinations fit (above), close in time, a free seat, two different people. */
export function offerFitsRequest(offer: Plan, request: Plan) {
  return (
    offer.kind === "offer" &&
    request.kind === "request" &&
    offer.status === "open" &&
    request.status === "open" &&
    offer.seats > 0 &&
    offer.userId !== request.userId &&
    destinationsFit(offer, request) &&
    Math.abs(offer.departAt.getTime() - request.departAt.getTime()) <= MATCH_WINDOW_MIN * 60_000
  );
}

export const floatActive = (f: Float, now: Date) => !f.endedAt && f.liveUntil.getTime() > now.getTime();

/** Is this floater close enough to pick someone up at `fromPlace`? */
export function floaterNear(f: Float, fromPlace: string, now: Date) {
  const p = placeById(fromPlace);
  return located(p) && floatActive(f, now) && distanceM(f, p) <= FLOAT_RADIUS_M;
}
