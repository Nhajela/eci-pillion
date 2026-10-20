import { destName, placeName } from "@/lib/places";
import { istHHMM } from "@/lib/time";
import type { FeedItem } from "@/services/stats";

type P = { rides: number; riders: number; askers: number; askingNow: number; seatsNow: number; floatingNow: number; people: number; next: number };

export function Face({ u, size = 36 }: { u: { name: string; avatar: string | null; scooty: string }; size?: number }) {
  return u.avatar
    ? <img className="face" src={u.avatar} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="face blank" style={{ background: u.scooty, width: size, height: size }} aria-hidden>{u.name.slice(0, 1)}</span>;
}

/** The village in numbers: a strip of counters that links to the board. */
export function Pulse({ p, compact = false }: { p: P; compact?: boolean }) {
  const items: [number, string][] = compact
    ? [[p.rides, p.rides === 1 ? "ride shared" : "rides shared"], [p.askingNow, "asking now"], [p.floatingNow, "floating"]]
    : [[p.rides, p.rides === 1 ? "ride shared" : "rides shared"], [p.riders, "riders"], [p.askers, "people asked"], [p.askingNow, "asking right now"], [p.seatsNow, "seats going"], [p.floatingNow, "floating now"]];
  return (
    <a className={`pulse ${compact ? "compact" : ""}`} href="/board" aria-label="The village board">
      {items.map(([n, label]) => (
        <span key={label} className="pulse-item"><b>{n}</b><span>{label}</span></span>
      ))}
      <span className="pulse-more">The village board →</span>
    </a>
  );
}

/** How close the village is to its next ride milestone. */
export function Milestone({ rides, next }: { rides: number; next: number }) {
  const pct = Math.min(100, Math.round((rides / next) * 100));
  return (
    <div className="milestone">
      <div className="milestone-bar" role="progressbar" aria-valuemin={0} aria-valuemax={next} aria-valuenow={rides} aria-label="Rides towards the next milestone">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="hint">{rides} of {next} rides to the next village milestone. 🎉 We celebrate in the group when we get there.</p>
    </div>
  );
}

export function ago(at: Date, now: Date) {
  const m = Math.round((now.getTime() - at.getTime()) / 60_000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  return `${at.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" })} ${istHHMM(at)}`;
}

/** "Asha took Ben to Arambol", newest first. */
export function RideFeed({ items, now }: { items: FeedItem[]; now: Date }) {
  if (!items.length) return <p className="empty">No rides yet. The first one gets celebrated in the group. Could be yours.</p>;
  return (
    <ul className="feed">
      {items.map((r) => (
        <li key={r.id}>
          <span className="pair"><Face u={r.pilot} /><Face u={r.hitcher} /></span>
          <span>
            <b>{r.pilot.name}</b> {r.vehicle === "car" ? "🚗" : "🛵"} took <b>{r.hitcher.name}</b> {r.to === "errand" ? `on ${destName(r.to)} from ${placeName(r.from)}` : <>to <b>{placeName(r.to)}</b></>}
            {r.viaFloat ? " 🌴" : ""}
            <span className="hint"> · {ago(r.at, now)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
