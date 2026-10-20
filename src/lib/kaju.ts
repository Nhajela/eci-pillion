// The kaju rules, as pure functions. The ledger lives in services/kaju.ts.
export const KAJU = {
  signup: 10,
  planEarly: 15, // lead >= 2 h
  planSoon: 10, // lead >= 30 min
  planNow: 5,
  planAwardsPerDay: 3,
  ridePilot: 30,
  rideHitcher: 10,
  floatPer15: 5,
  floatMaxPerDay: 120,
  lateCancel: -5,
  floaterRefusal: -10, // a floater who refuses (or ignores) a nearby request: −10, the last hour unpaid, float ends
  floaterRefusalForfeitMin: 60,
  floaterAnswerMin: 10, // minutes a pinged floater has to answer before it counts as a refusal
  pairRidesPerDay: 2, // the same pilot + hitcher are paid for at most 2 rides a day (no ride farming)
  lateCancelWindowMin: 30,
  inviteJoin: 10, // someone you invited signs up
  inviteRide: 15, // …and completes their first ride (the part that matters)
} as const;

/** Seats a vehicle can offer: a scooty or bike carries one pillion, a car up to 6. */
export const maxSeats = (vehicle: string) => (vehicle === "car" ? 6 : vehicle === "none" ? 0 : 1);
export const vehicleEmoji = (vehicle: string) => (vehicle === "car" ? "🚗" : vehicle === "bike" ? "🏍️" : "🛵");

export function planKaju(leadMinutes: number) {
  if (leadMinutes >= 120) return KAJU.planEarly;
  if (leadMinutes >= 30) return KAJU.planSoon;
  return KAJU.planNow;
}

/** Kaju for a float of `minutes`, given what floating already earned today. */
export function floatKaju(minutes: number, earnedToday: number) {
  const raw = Math.floor(Math.max(0, minutes) / 15) * KAJU.floatPer15;
  return Math.max(0, Math.min(raw, KAJU.floatMaxPerDay - earnedToday));
}

/** A cancel is "late" when it comes less than 30 min before departure, or after it. */
export function isLateCancel(departAt: Date, now: Date) {
  return departAt.getTime() - now.getTime() < KAJU.lateCancelWindowMin * 60_000;
}
