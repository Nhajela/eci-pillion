import type { Metadata } from "next";
import { Face, RideFeed } from "@/components/pulse";
import { db, hasDb } from "@/db";
import { destName, placeName, tripLabel } from "@/lib/places";
import { istHHMM } from "@/lib/time";
import { activeFloats } from "@/services/floats";
import { nearestPlace } from "@/lib/places";
import { loadPlaces } from "@/services/places";
import { departures, kajuLeaders, leaders, recentRides } from "@/services/stats";

export const dynamic = "force-dynamic";
// Hidden for now: not linked anywhere, not indexed. Later we make it fun.
export const metadata: Metadata = { title: "Departures · Pillion", robots: { index: false, follow: false } };

type Row = { id: number; name: string; avatar: string | null; scooty: string; n: number };

function Top({ title, rows, unit }: { title: string; rows: Row[]; unit: string }) {
  return (
    <div className="fb-panel">
      <h3>{title}</h3>
      {!rows.length ? <p className="fb-empty">—</p> : (
        <ol className="fb-top">
          {rows.map((r) => <li key={r.id}><Face u={r} size={28} /><span>{r.name}</span><b>{r.n}</b><small>{unit}</small></li>)}
        </ol>
      )}
    </div>
  );
}

export default async function Departures() {
  if (!hasDb()) return <main className="flightboard"><h1>Departures</h1></main>;
  const d = db();
  const now = new Date();
  await loadPlaces(d);
  const [deps, arrivals, floats, k, top] = await Promise.all([departures(d, now), recentRides(d, 12), activeFloats(d, now), kajuLeaders(d, now), leaders(d, 10)]);
  return (
    <main className="flightboard">
      <header className="fb-head">
        <h1>🛵 Departures</h1>
        <span className="fb-clock">{istHHMM(now)} IST</span>
      </header>

      <table className="fb-table">
        <thead><tr><th>Time</th><th>From</th><th>To</th><th>Who</th><th>Status</th></tr></thead>
        <tbody>
          {!deps.length && <tr><td colSpan={5} className="fb-empty">No departures scheduled. The lanes are quiet.</td></tr>}
          {deps.map((x, i) => (
            <tr key={i} className={`st-${x.status.split(" ")[0].toLowerCase()}`}>
              <td>{istHHMM(x.at)}</td>
              <td>{placeName(x.from)}</td>
              <td>{destName(x.to, x.note, x.rangeKm)}{tripLabel(x.from, x.to, x.rangeKm) ? <small> {tripLabel(x.from, x.to, x.rangeKm)}</small> : null}</td>
              <td>{x.vehicle === "car" ? "🚗 " : x.vehicle === "none" ? "🙋 " : "🛵 "}{x.who}</td>
              <td className="fb-status">{x.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="fb-grid">
        <div className="fb-panel">
          <h3>Arrivals</h3>
          <RideFeed items={arrivals} now={now} />
        </div>
        <div className="fb-panel">
          <h3>Floating now</h3>
          {!floats.length ? <p className="fb-empty">—</p> : (
            <ul className="fb-top">{floats.map(({ f, u }) => <li key={f.id}><Face u={u} size={28} /><span>{u.name}</span><small>near {nearestPlace(f).place?.name ?? "?"} since {istHHMM(f.startedAt)}</small></li>)}</ul>
          )}
        </div>
        <Top title="Kaju today" rows={k.today} unit="kaju" />
        <Top title="Kaju all time" rows={k.all} unit="kaju" />
        <Top title="Most generous pilots" rows={top.pilots} unit="rides" />
        <Top title="Most rides hitched" rows={top.hitchers} unit="rides" />
        <Top title="Brought the most friends" rows={top.inviters} unit="joined" />
        <Top title="Most devoted floaters" rows={top.floaters} unit="kaju" />
      </div>
    </main>
  );
}
