import type { Metadata } from "next";
import { ActButton } from "@/components/act";
import { Face, Milestone, Pulse, RideFeed } from "@/components/pulse";
import { TopBar } from "@/components/topbar";
import { db, hasDb } from "@/db";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { KAJU, vehicleEmoji } from "@/lib/kaju";
import { destName, placeName, tripLabel } from "@/lib/places";
import { istHHMM } from "@/lib/time";
import { balance } from "@/services/kaju";
import { loadPlaces } from "@/services/places";
import { leaders, openBoard, pulse, recentRides, topDestinations } from "@/services/stats";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "The village board · Pillion (beta)",
  description: "Every ride the village has shared, who's asking right now, and the most generous pilots.",
};

type Leader = { id: number; name: string; avatar: string | null; scooty: string; n: number };

function Leaders({ title, rows, unit, empty }: { title: string; rows: Leader[]; unit: string; empty: string }) {
  return (
    <div className="leaders">
      <h3>{title}</h3>
      {!rows.length ? <p className="empty">{empty}</p> : (
        <ol className="leader">
          {rows.map((r) => (
            <li key={r.id}><Face u={r} /><span className="lname">{r.name}</span><span className="lk">{r.n}<small> {unit}</small></span></li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function Board() {
  if (!hasDb()) return <main className="narrow"><h1>The village board</h1><p>Opening soon.</p></main>;
  const user = await currentUser();
  const d = db();
  const now = new Date();
  await loadPlaces(d);
  const [p, feed, top, open, dests] = await Promise.all([pulse(d, now), recentRides(d, 25), leaders(d), openBoard(d, now), topDestinations(d)]);
  const asks = open.filter((o) => o.plan.kind === "request" && o.plan.userId !== user?.id);
  const seats = open.filter((o) => o.plan.kind === "offer" && o.plan.userId !== user?.id);
  const bot = env.botUsername();
  const canTake = user && user.vehicle !== "none";

  return (
    <>
      {user ? <TopBar user={user} kaju={await balance(d, user.id)} /> : (
        <header className="topbar"><a href="/" className="brand">Pillion <span className="beta-pill">beta</span></a><nav><a href="/how-it-works">How it works</a><a href="/login">Log in</a></nav></header>
      )}
      <main className="app board">
        <h1>The village board</h1>
        <p className="lede">Every ride the village has shared, who&apos;s asking right now, and the people making it happen. As of {istHHMM(now)}.</p>

        <Pulse p={p} />
        <Milestone rides={p.rides} next={p.next} />

        <section className="card attention">
          <h2>🙋 Asking right now</h2>
          {!asks.length && <p className="empty">Nobody&apos;s waiting. Lovely. Going somewhere later? Post it early and someone can plan around you.</p>}
          {asks.map(({ plan, name, avatar, scooty }) => (
            <div key={plan.id} className="line">
              <span className="who"><Face u={{ name, avatar, scooty }} /><span><b>{name}</b> · {istHHMM(plan.departAt)} {placeName(plan.fromPlace)} → <b>{destName(plan.toPlace, plan.note, plan.rangeKm)}</b>{tripLabel(plan.fromPlace, plan.toPlace, plan.rangeKm) && <span className="hint"> · 🧭 {tripLabel(plan.fromPlace, plan.toPlace, plan.rangeKm)}</span>}</span></span>
              {canTake ? <ActButton body={{ action: "take", id: plan.id }} done="Matched! Check Telegram. 🛵">I&apos;ll take them</ActButton>
                : !user && bot ? <a className="btn small ghost" href={`https://t.me/${bot}`}>Help in the bot</a> : null}
            </div>
          ))}
        </section>

        {seats.length > 0 && (
          <section className="card">
            <h2>🛵 Seats going</h2>
            {seats.map(({ plan, name, avatar, scooty, vehicle }) => (
              <div key={plan.id} className="line">
                <span className="who"><Face u={{ name, avatar, scooty }} /><span>{vehicleEmoji(vehicle)} <b>{name}</b> · {istHHMM(plan.departAt)} {placeName(plan.fromPlace)} → <b>{destName(plan.toPlace, plan.note, plan.rangeKm)}</b>{tripLabel(plan.fromPlace, plan.toPlace, plan.rangeKm) && <span className="hint"> · 🧭 {tripLabel(plan.fromPlace, plan.toPlace, plan.rangeKm)}</span>} · {plan.seats} seat{plan.seats > 1 ? "s" : ""}</span></span>
                {user ? <ActButton body={{ action: "hop", id: plan.id }} done="You're on! Check Telegram. 🛵">Hop on</ActButton>
                  : bot ? <a className="btn small ghost" href={`https://t.me/${bot}`}>Hop on in the bot</a> : null}
              </div>
            ))}
          </section>
        )}

        <section className="card">
          <h2>🎉 Rides that happened</h2>
          <RideFeed items={feed} now={now} />
        </section>

        {dests.length > 0 && (
          <section className="card">
            <h2>📍 Where the village goes</h2>
            <p className="hint">Ranked by everyone&apos;s plans. The pickers in the bot and on the site follow this order, so popular places come first. Missing one? Add it under “➕ Somewhere else”.</p>
            <ol className="leader">
              {dests.map((x) => (
                <li key={x.id}><span className="lname">{placeName(x.id)}</span><span className="lk">{x.n}<small> plans</small></span></li>
              ))}
            </ol>
          </section>
        )}

        <section className="card">
          <h2>🏆 The people making it happen</h2>
          <div className="leaders-grid">
            <Leaders title="Most generous pilots" rows={top.pilots} unit="rides" empty="The first pilot's name goes here." />
            <Leaders title="Most rides hitched" rows={top.hitchers} unit="rides" empty="Ask for a ride and you're on the board." />
            <Leaders title="Brought the most friends" rows={top.inviters} unit="joined" empty="Invite a friend: /invite in the bot." />
            <Leaders title="Most devoted floaters" rows={top.floaters} unit="kaju" empty="Share your live location and float." />
          </div>
        </section>

        <section className="card invite-cta">
          <h2>💌 More people, more rides</h2>
          <p>Every person who joins makes a match likelier for everyone. Invite a friend: +{KAJU.inviteJoin} kaju when they sign up, +{KAJU.inviteRide} when they take their first ride.</p>
          {user ? <a className="btn small" href="/home#invite">Invite friends</a> : bot ? <a className="btn small" href={`https://t.me/${bot}?start=board`}>Join on Telegram</a> : null}
        </section>
      </main>
    </>
  );
}
