import type { Float, Plan } from "@/db/schema";
import { distanceM, placeById } from "./places";

export const MATCH_WINDOW_MIN = 45;
export const FLOAT_RADIUS_M = 3000;

/** Does this offer suit this request? Same destination, close in time, a free seat, two different people. */
export function offerFitsRequest(offer: Plan, request: Plan) {
  return (
    offer.kind === "offer" &&
    request.kind === "request" &&
    offer.status === "open" &&
    request.status === "open" &&
    offer.seats > 0 &&
    offer.userId !== request.userId &&
    offer.toPlace === request.toPlace &&
    Math.abs(offer.departAt.getTime() - request.departAt.getTime()) <= MATCH_WINDOW_MIN * 60_000
  );
}

export const floatActive = (f: Float, now: Date) => !f.endedAt && f.liveUntil.getTime() > now.getTime();

/** Is this floater close enough to pick someone up at `fromPlace`? */
export function floaterNear(f: Float, fromPlace: string, now: Date) {
  const p = placeById(fromPlace);
  return Boolean(p) && floatActive(f, now) && distanceM(f, p!) <= FLOAT_RADIUS_M;
}
