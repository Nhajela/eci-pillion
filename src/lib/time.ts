// Everything people see is IST. Pure helpers take `now` so tests can pin time.
const TZ = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;

export function istHHMM(d: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .format(d)
    .replace(" ", "")
    .toLowerCase();
}

/** IST calendar day as YYYY-MM-DD. */
export function istDay(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Minutes since IST midnight. */
export function istMinuteOfDay(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** The Date for HH:MM IST on the IST day of `now`; rolls to tomorrow if that is more than 1 h in the past. */
export function istTimeToday(hhmm: string, now: Date): Date | null {
  const m = /^(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?$/i.exec(hhmm.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  const [y, mo, da] = istDay(now).split("-").map(Number);
  let t = new Date(Date.UTC(y, mo - 1, da, h, min) - IST_OFFSET_MIN * 60_000);
  if (t.getTime() < now.getTime() - 60 * 60_000) t = new Date(t.getTime() + 24 * 60 * 60_000);
  return t;
}

/** Start of the IST day containing `d`, as a UTC Date. */
export function istDayStart(d: Date) {
  const [y, mo, da] = istDay(d).split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, da) - IST_OFFSET_MIN * 60_000);
}
