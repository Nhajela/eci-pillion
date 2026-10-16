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
  lateCancelWindowMin: 30,
} as const;

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
