import { and, eq, inArray, lt, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ActButton } from "@/components/act";
import { AvatarSync } from "@/components/avatar-sync";
import { PlanForm } from "@/components/plan-form";
import { TopBar } from "@/components/topbar";
import { db } from "@/db";
import { rides, users } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { allPlaces, destName, nearestPlace, placeName, tripLabel } from "@/lib/places";
import { loadPlaces } from "@/services/places";
import { InviteCard } from "@/components/invite-card";
import { Pulse } from "@/components/pulse";
import { inviteLink, myInvites, shareUrl } from "@/services/invites";
import { pulse } from "@/services/stats";
import { leaveFor, upcomingEvents } from "@/services/events";
import { KAJU } from "@/lib/kaju";
import { ist24, istHHMM } from "@/lib/time";
import { maxSeats, vehicleEmoji } from "@/lib/kaju";
import { activeFloats } from "@/services/floats";
import { balance, history, REASON_LABEL } from "@/services/kaju";
import { myPlans, openPlans } from "@/services/plans";
import { myRides } from "@/services/rides";

export const dynamic = "force-dynamic";

function Face({ u }: { u: { avatar: string | null; scooty: string; name: string } }) {
  return u.avatar ? <img className="face" src={u.avatar} alt="" width={40} height={40} /> : <span className="face blank" style={{ background: u.scooty }} aria-hidden>{u.name.slice(0, 1)}</span>;
}

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const now = new Date();
  const d = db();
  await loadPlaces(d);
  const [kaju, hist, mine, board, live, floats] = await Promise.all([
    balance(d, user.id), history(d, user.id, 8), myPlans(d, user.id, now), openPlans(d, now), myRides(d, user.id), activeFloats(d, now),
  ]);
  const [link, invited, village, events] = await Promise.all([inviteLink(d, user), myInvites(d, user), pulse(d, now), upcomingEvents(d, now)]);
  const toConfirm = await d.select().from(rides).where(and(eq(rides.status, "matched"), lt(rides.departAt, new Date(now.getTime() - 20 * 60_000)), or(eq(rides.pilotId, user.id), eq(rides.hitcherId, user.id))));
  const otherIds = [...live, ...toConfirm].map((r) => (r.pilotId === user.id ? r.hitcherId : r.pilotId));
  const others = otherIds.length ? await d.select().from(users).where(inArray(users.id, otherIds)) : [];
  const nameOf = (id: number) => others.find((o) => o.id === id)?.name ?? "someone";
  const myFloat = floats.find((f) => f.u.id === user.id);
  const offers = board.filter((b) => b.plan.kind === "offer" && b.user.id !== user.id);
  const requests = board.filter((b) => b.plan.kind === "request" && b.user.id !== user.id);
  const upcoming = live.filter((r) => !toConfirm.some((t) => t.id === r.id));

  const trip = (p: { fromPlace: string; toPlace: string; rangeKm: number | null }) => tripLabel(p.fromPlace, p.toPlace, p.rangeKm);
  const pickEvents = events.map((e) => ({ id: e.id, title: e.title, time: istHHMM(e.startAt), place: placeName(e.placeId!), leaveAt: ist24(leaveFor(e.startAt, now)) }));
  const otherFloats = floats.filter((f) => f.u.id !== user.id);

  return (
    <>
      <TopBar user={user} kaju={kaju} />
      <AvatarSync hasAvatar={Boolean(user.avatar)} />
      <main className="app home">
        <header className="home-head">
          <h1>Hey {user.name} 👋</h1>
          <p className="lede">{requests.length ? `${requests.length} ${requests.length === 1 ? "person is" : "people are"} looking for a ride.` : "Where are you off to?"}</p>
        </header>

        {toConfirm.length > 0 && (
          <section className="card attention">
            <h2>✅ Did these happen?</h2>
            {toConfirm.map((r) => (
              <div key={r.id} className="item">
                <div className="item-main">
                  <span className="item-time">{istHHMM(r.departAt)}</span>
                  <span>to <b>{destName(r.toPlace, null, r.rangeKm)}</b> with {nameOf(r.pilotId === user.id ? r.hitcherId : r.pilotId)}</span>
                </div>
                <div className="item-actions">
                  <ActButton body={{ action: "confirm", id: r.id, happened: true }} className="btn small">We rode</ActButton>
                  <ActButton body={{ action: "confirm", id: r.id, happened: false }} className="btn small ghost">Didn&apos;t happen</ActButton>
                </div>
              </div>
            ))}
          </section>
        )}

        {(upcoming.length > 0 || mine.some((p) => p.status === "open")) && (
          <section className="card">
            <h2>🗓️ Your plans</h2>
            {upcoming.map((r) => (
              <div key={`r${r.id}`} className="item">
                <div className="item-main">
                  <span className="item-time">{istHHMM(r.departAt)}</span>
                  <span>{placeName(r.fromPlace)} → <b>{destName(r.toPlace, null, r.rangeKm)}</b></span>
                  <span className="item-sub">{r.pilotId === user.id ? "🛵 You're taking" : "🙋 Riding with"} {nameOf(r.pilotId === user.id ? r.hitcherId : r.pilotId)}{trip(r) ? ` · 🧭 ${trip(r)}` : ""}</span>
                </div>
                <div className="item-actions">
                  <ActButton body={{ action: "cancelRide", id: r.id }} className="btn small ghost" confirm="Cancel this ride? Inside 30 minutes it costs 5 kaju.">Can&apos;t make it</ActButton>
                </div>
              </div>
            ))}
            {mine.filter((p) => p.status === "open").map((p) => (
              <div key={`p${p.id}`} className="item">
                <div className="item-main">
                  <span className="item-time">{istHHMM(p.departAt)}</span>
                  <span>{placeName(p.fromPlace)} → <b>{destName(p.toPlace, p.note, p.rangeKm)}</b></span>
                  <span className="item-sub">{p.kind === "offer" ? `🛵 Offering ${p.seats} seat${p.seats > 1 ? "s" : ""}` : "🙋 Waiting for a pilot"} · not matched yet</span>
                </div>
                <div className="item-actions">
                  <ActButton body={{ action: "cancelPlan", id: p.id }} className="btn small ghost">Cancel</ActButton>
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="card bot-card">
          <p><b>💬 You can also do all of this in the bot.</b> Ask for a ride, offer a seat, see who&apos;s going where and float, right in Telegram. Handy on the go.</p>
          <a className="btn small" href={`https://t.me/${env.botUsername()}`}>Open @{env.botUsername()}</a>
        </section>

        <section className="card plan-card" id="plan">
          <h2>Post a plan</h2>
          <PlanForm places={allPlaces().map((p) => ({ id: p.id, name: p.name, kind: p.kind }))} events={pickEvents} hasWheels={user.vehicle !== "none"} maxSeats={Math.max(1, Math.min(user.seats, maxSeats(user.vehicle)))} car={user.vehicle === "car"} />
        </section>

        {!user.avatar && (
          <section className="card onboard-card slim">
            <p><b>One last step:</b> draw yourself, so people know who&apos;s picking them up.</p>
            <a className="btn small" href="/avatar?welcome=1">🎨 Draw my avatar</a>
          </section>
        )}

        <section className="card">
          <h2>🛣️ On the road</h2>
          {!offers.length && !requests.length && <p className="empty">Quiet lanes right now. Be the first to post: early plans earn the most kaju.</p>}
          {requests.length > 0 && <h3>Looking for a ride</h3>}
          {requests.map(({ plan, user: u }) => (
            <div key={plan.id} className="item">
              <Face u={u} />
              <div className="item-main">
                <span><b>{u.name}</b> <span className="item-time">{istHHMM(plan.departAt)}</span></span>
                <span>{placeName(plan.fromPlace)} → <b>{destName(plan.toPlace, plan.note, plan.rangeKm)}</b></span>
                {trip(plan) && <span className="item-sub">🧭 {trip(plan)}</span>}
              </div>
              {user.vehicle !== "none" && <div className="item-actions"><ActButton body={{ action: "take", id: plan.id }} done="Matched! Check Telegram. 🛵">I&apos;ll take them</ActButton></div>}
            </div>
          ))}
          {offers.length > 0 && <h3>Seats going</h3>}
          {offers.map(({ plan, user: u }) => (
            <div key={plan.id} className="item">
              <Face u={u} />
              <div className="item-main">
                <span><b>{u.name}</b> {vehicleEmoji(u.vehicle)} <span className="item-time">{istHHMM(plan.departAt)}</span></span>
                <span>{placeName(plan.fromPlace)} → <b>{destName(plan.toPlace, plan.note, plan.rangeKm)}</b></span>
                <span className="item-sub">{plan.seats} seat{plan.seats > 1 ? "s" : ""} free{trip(plan) ? ` · 🧭 ${trip(plan)}` : ""}</span>
              </div>
              <div className="item-actions"><ActButton body={{ action: "hop", id: plan.id }} done="You're on! Check Telegram. 🛵">Hop on</ActButton></div>
            </div>
          ))}
        </section>

        <section className="card float-card">
          <h2>🌴 Float</h2>
          {myFloat ? (
            <div className="item">
              <div className="item-main">
                <span>You&apos;re floating near <b>{nearestPlace(myFloat.f).place.name}</b> since {istHHMM(myFloat.f.startedAt)}.</span>
                <span className="item-sub">+10 kaju an hour. Answer the pings, or that hour goes.</span>
              </div>
              <div className="item-actions"><ActButton body={{ action: "stopFloat" }} className="btn small ghost">Stop floating</ActButton></div>
            </div>
          ) : (
            <>
              <p>Nowhere to be? Share your live location with the bot and get +10 kaju an hour. When someone nearby needs a ride, you get pinged. Floaters say yes.</p>
              <ol className="steps compact">
                <li>Open <a href={`https://t.me/${env.botUsername()}`}>the bot</a></li>
                <li>Tap 📎 → <b>Location</b> → <b>Share My Live Location</b></li>
              </ol>
            </>
          )}
          {otherFloats.length > 0 && <p className="hint">Floating now: {otherFloats.map((f) => `${f.u.name} (near ${nearestPlace(f.f).place.name})`).join(", ")}</p>}
        </section>

        <InviteCard link={link} share={shareUrl(link)} joined={invited.joined} waiting={invited.waiting} join={KAJU.inviteJoin} ride={KAJU.inviteRide} />

        <section className="card">
          <h2>🥜 {kaju} kaju</h2>
          {!hist.length && <p className="empty">Nothing yet. Post a plan to get your first.</p>}
          <ul className="ledger">
            {hist.map((h) => (
              <li key={h.id}><span className={h.amount < 0 ? "minus" : "plus"}>{h.amount > 0 ? "+" : ""}{h.amount}</span> {REASON_LABEL[h.reason] ?? h.reason}</li>
            ))}
          </ul>
        </section>

        <Pulse p={village} compact />
      </main>
    </>
  );
}
