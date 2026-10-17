import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { ActButton } from "@/components/act";
import { TopBar } from "@/components/topbar";
import { VillageMap, type MapPerson } from "@/components/village-map";
import { db, hasDb } from "@/db";
import { hearts, kaju, rides, users } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { nearestPlace } from "@/lib/places";
import { istDay, istDayStart } from "@/lib/time";
import { activeFloats } from "@/services/floats";
import { balance } from "@/services/kaju";
import { computeWinners, PRIZES } from "@/services/prizes";

export const dynamic = "force-dynamic";

export default async function Today() {
  const user = await currentUser();
  if (!hasDb()) return <main className="narrow"><h1>Today</h1><p>Opening soon.</p></main>;
  const d = db();
  const now = new Date();
  const day = istDay(now);
  const start = istDayStart(now);
  const [board, floats, todaysRides, winners, heartRows] = await Promise.all([
    d.select({ id: users.id, name: users.name, avatar: users.avatar, scooty: users.scooty, k: sql<number>`sum(${kaju.amount})::int` })
      .from(kaju).innerJoin(users, eq(kaju.userId, users.id)).where(eq(kaju.day, day)).groupBy(users.id).orderBy(sql`sum(${kaju.amount}) desc`).limit(20),
    activeFloats(d, now),
    d.select().from(rides).where(and(inArray(rides.status, ["matched", "done"]), gte(rides.departAt, start))),
    computeWinners(d, day),
    d.select({ toId: hearts.toId, n: sql<number>`count(*)::int` }).from(hearts).where(eq(hearts.day, day)).groupBy(hearts.toId),
  ]);
  const riderIds = [...new Set(todaysRides.flatMap((r) => [r.pilotId, r.hitcherId]))];
  const riders = riderIds.length ? await d.select().from(users).where(inArray(users.id, riderIds)) : [];
  const floatIds = new Set(floats.map((f) => f.u.id));
  const people: MapPerson[] = [
    ...floats.map((f) => ({ id: f.u.id, name: f.u.name, avatar: f.u.avatar, scooty: f.u.scooty, vehicle: f.u.vehicle, floatAt: nearestPlace(f.f).place.id })),
    ...riders.filter((u) => !floatIds.has(u.id)).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, scooty: u.scooty, vehicle: u.vehicle })),
  ];
  const ids = winners.flatMap((w) => w.userIds);
  const winnerNames = ids.length ? await d.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
  const heartsFor = (id: number) => heartRows.find((h) => h.toId === id)?.n ?? 0;
  const done = todaysRides.filter((r) => r.status === "done").length;

  return (
    <>
      {user ? <TopBar user={user} kaju={await balance(d, user.id)} /> : <header className="topbar"><a href="/" className="brand">Pillion</a><nav><a href="/login">Log in</a></nav></header>}
      <main className="app">
        <h1>Today in the village</h1>
        <p className="lede">{done} ride{done === 1 ? "" : "s"} done, {floats.length} floating right now. Prizes are handed out at 9pm.</p>
        <div className="map-scroll"><VillageMap people={people} /></div>

        <section className="card">
          <h2>🏅 Prizes so far</h2>
          <ul className="prize-list">
            {(Object.keys(PRIZES) as (keyof typeof PRIZES)[]).map((k) => {
              const w = winners.find((x) => x.prize === k);
              return (
                <li key={k}>
                  <b>{PRIZES[k].title}</b>
                  <span>{w ? w.userIds.map((id) => winnerNames.find((n) => n.id === id)?.name).join(", ") : "Up for grabs"}</span>
                  <span className="hint">{PRIZES[k].line}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <h2>🥜 Kaju today</h2>
          {!board.length && <p className="empty">Nobody's on the board yet. Post a plan and you're top of it.</p>}
          <ol className="leader">
            {board.map((b) => (
              <li key={b.id}>
                {b.avatar ? <img className="face" src={b.avatar} alt="" width={40} height={40} /> : <span className="face blank" style={{ background: b.scooty }}>{b.name.slice(0, 1)}</span>}
                <span className="lname">{b.name}</span>
                <span className="lk">{b.k}</span>
                {user && b.avatar && b.id !== user.id && (
                  <ActButton body={{ action: "heart", id: b.id }} className="heart" done="💛">♥ {heartsFor(b.id)}</ActButton>
                )}
              </li>
            ))}
          </ol>
          <p className="hint">Heart the avatars you love: most hearts wins Best Avatar.</p>
        </section>
      </main>
    </>
  );
}
