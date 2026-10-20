import { and, gte, inArray } from "drizzle-orm";
import { TopBar } from "@/components/topbar";
import { VillageMap, type MapPerson } from "@/components/village-map";
import { db, hasDb } from "@/db";
import { rides, users } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { nearestMapPlace } from "@/lib/places";
import { istDayStart } from "@/lib/time";
import { activeFloats } from "@/services/floats";
import { balance } from "@/services/kaju";
import { Pulse, RideFeed } from "@/components/pulse";
import { loadPlaces } from "@/services/places";
import { pulse, recentRides } from "@/services/stats";

export const dynamic = "force-dynamic";

export default async function Today() {
  const user = await currentUser();
  if (!hasDb()) return <main className="narrow"><h1>Today</h1><p>Opening soon.</p></main>;
  const d = db();
  const now = new Date();
  const start = istDayStart(now);
  await loadPlaces(d);
  const [floats, todaysRides, feed] = await Promise.all([
    activeFloats(d, now),
    d.select().from(rides).where(and(inArray(rides.status, ["matched", "done"]), gte(rides.departAt, start))),
    recentRides(d, 50),
  ]);
  const village = await pulse(d, now);
  const riderIds = [...new Set(todaysRides.flatMap((r) => [r.pilotId, r.hitcherId]))];
  const riders = riderIds.length ? await d.select().from(users).where(inArray(users.id, riderIds)) : [];
  const floatIds = new Set(floats.map((f) => f.u.id));
  const people: MapPerson[] = [
    ...floats.map((f) => ({ id: f.u.id, name: f.u.name, avatar: f.u.avatar, scooty: f.u.scooty, vehicle: f.u.vehicle, floatAt: nearestMapPlace(f.f).place.id })),
    ...riders.filter((u) => !floatIds.has(u.id)).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, scooty: u.scooty, vehicle: u.vehicle })),
  ];
  const done = todaysRides.filter((r) => r.status === "done").length;

  return (
    <>
      {user ? <TopBar user={user} kaju={await balance(d, user.id)} /> : <header className="topbar"><a href="/" className="brand">Pillion</a><nav><a href="/login">Log in</a></nav></header>}
      <main className="app">
        <h1>Today in the village</h1>
        <p className="lede">{done} ride{done === 1 ? "" : "s"} done, {floats.length} floating right now.</p>
        <Pulse p={village} compact />
        <div className="map-scroll"><VillageMap people={people} /></div>

        <section className="card">
          <h2>🎉 Rides today</h2>
          <RideFeed items={feed.filter((r) => r.at >= start)} now={now} />
          <p className="hint">Every ride ever, who&apos;s asking now and where the village goes: <a href="/board">the village board</a>.</p>
        </section>
      </main>
    </>
  );
}
