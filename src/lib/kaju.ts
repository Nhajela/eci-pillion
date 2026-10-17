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
  floaterCancel: -10, // a floater who drops a pickup: −10, and no float kaju for that hour
  floaterCancelForfeitMin: 60,
  lateCancelWindowMin: 30,
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
