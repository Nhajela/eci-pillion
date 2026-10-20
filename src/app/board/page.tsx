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
import { openBoard, pulse, recentRides, topDestinations } from "@/services/stats";
import { upcomingEvents } from "@/services/events";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "The village board · Pillion (beta)",
  description: "Every ride the village has shared, who's asking right now, and where everyone's going.",
};

export default async function Board() {
  if (!hasDb()) return <main className="narrow"><h1>The village board</h1><p>Opening soon.</p></main>;
  const user = await currentUser();
  const d = db();
  const now = new Date();
  await loadPlaces(d);
  const [p, feed, open, dests, events] = await Promise.all([pulse(d, now), recentRides(d, 25), openBoard(d, now), topDestinations(d), upcomingEvents(d, now, 12)]);
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
        <p className="lede">Every ride the village has shared, who&apos;s asking right now, and where everyone&apos;s going. As of {istHHMM(now)}.</p>

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

        {events.length > 0 && (
          <section className="card">
            <h2>📅 Coming up: ride there</h2>
            <p className="hint">From the Edge City calendar. In the bot, /ride → “📅 To an event” gets you there 15 minutes early.</p>
            {events.slice(0, 8).map((e) => (
              <div key={e.id} className="line"><span><b>{istHHMM(e.startAt)}</b> {e.title} · <b>{placeName(e.placeId!)}</b></span></div>
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

        <section className="card invite-cta">
          <h2>💌 More people, more rides</h2>
          <p>Every person who joins makes a match likelier for everyone. Invite a friend: +{KAJU.inviteJoin} kaju when they sign up, +{KAJU.inviteRide} when they take their first ride.</p>
          {user ? <a className="btn small" href="/home#invite">Invite friends</a> : bot ? <a className="btn small" href={`https://t.me/${bot}?start=board`}>Join on Telegram</a> : null}
        </section>
      </main>
    </>
  );
}
