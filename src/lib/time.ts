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
/** "18:45" in IST, for <input type="time">. */
export function ist24(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

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

/** Minutes of [start, end) that fall in floating hours, 07:00–23:00 IST. Nobody needs a floater at 3am. */
export function floatableMinutes(start: Date, end: Date) {
  let total = 0;
  let day = istDayStart(start);
  while (day.getTime() < end.getTime()) {
    const open = day.getTime() + 7 * 3600_000;
    const close = day.getTime() + 23 * 3600_000;
    total += Math.max(0, Math.min(close, end.getTime()) - Math.max(open, start.getTime()));
    day = new Date(day.getTime() + 24 * 3600_000);
  }
  return Math.floor(total / 60_000);
}

/** Start of the IST day containing `d`, as a UTC Date. */
export function istDayStart(d: Date) {
  const [y, mo, da] = istDay(d).split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, da) - IST_OFFSET_MIN * 60_000);
}
