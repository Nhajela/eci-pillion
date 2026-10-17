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
import { nearestPlace, placeName } from "@/lib/places";
import { istHHMM } from "@/lib/time";
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
  const [kaju, hist, mine, board, live, floats] = await Promise.all([
    balance(d, user.id), history(d, user.id, 8), myPlans(d, user.id, now), openPlans(d, now), myRides(d, user.id), activeFloats(d, now),
  ]);
  const toConfirm = await d.select().from(rides).where(and(eq(rides.status, "matched"), lt(rides.departAt, new Date(now.getTime() - 20 * 60_000)), or(eq(rides.pilotId, user.id), eq(rides.hitcherId, user.id))));
  const otherIds = [...live, ...toConfirm].map((r) => (r.pilotId === user.id ? r.hitcherId : r.pilotId));
  const others = otherIds.length ? await d.select().from(users).where(inArray(users.id, otherIds)) : [];
  const nameOf = (id: number) => others.find((o) => o.id === id)?.name ?? "someone";
  const myFloat = floats.find((f) => f.u.id === user.id);
  const offers = board.filter((b) => b.plan.kind === "offer" && b.user.id !== user.id);
  const requests = board.filter((b) => b.plan.kind === "request" && b.user.id !== user.id);
  const upcoming = live.filter((r) => !toConfirm.some((t) => t.id === r.id));

  return (
    <>
      <TopBar user={user} kaju={kaju} />
      <AvatarSync hasAvatar={Boolean(user.avatar)} />
      <main className="app">
        <h1>Hey {user.name} 👋</h1>

        {toConfirm.length > 0 && (
          <section className="card attention">
            <h2>Did these happen?</h2>
            {toConfirm.map((r) => (
              <div key={r.id} className="line">
                <span>{istHHMM(r.departAt)} → <b>{placeName(r.toPlace)}</b> with {nameOf(r.pilotId === user.id ? r.hitcherId : r.pilotId)}</span>
                <span className="btns">
                  <ActButton body={{ action: "confirm", id: r.id, happened: true }} className="btn small">✅ We rode</ActButton>
                  <ActButton body={{ action: "confirm", id: r.id, happened: false }} className="btn small ghost">Didn&apos;t happen</ActButton>
                </span>
              </div>
            ))}
          </section>
        )}

        {(upcoming.length > 0 || mine.length > 0) && (
          <section className="card">
            <h2>Your plans</h2>
            {upcoming.map((r) => (
              <div key={`r${r.id}`} className="line">
                <span>🛵 <b>{istHHMM(r.departAt)}</b> {placeName(r.fromPlace)} → <b>{placeName(r.toPlace)}</b>, {r.pilotId === user.id ? "taking" : "riding with"} {nameOf(r.pilotId === user.id ? r.hitcherId : r.pilotId)}</span>
                <ActButton body={{ action: "cancelRide", id: r.id }} className="btn small ghost" confirm="Cancel this ride? Inside 30 minutes it costs 5 kaju.">Can&apos;t make it</ActButton>
              </div>
            ))}
            {mine.filter((p) => p.status === "open").map((p) => (
              <div key={`p${p.id}`} className="line">
                <span>{p.kind === "offer" ? `🛵 Going, ${p.seats} seat${p.seats > 1 ? "s" : ""} free` : "🙋 Looking for a ride"} · <b>{istHHMM(p.departAt)}</b> {placeName(p.fromPlace)} → <b>{placeName(p.toPlace)}</b></span>
                <ActButton body={{ action: "cancelPlan", id: p.id }} className="btn small ghost">Cancel</ActButton>
              </div>
            ))}
          </section>
        )}

        <section className="card">
          <h2>Post a plan</h2>
          <PlanForm hasWheels={user.vehicle !== "none"} maxSeats={Math.max(1, Math.min(user.seats, maxSeats(user.vehicle)))} car={user.vehicle === "car"} />
        </section>

        <section className="card">
          <h2>On the road</h2>
          {!offers.length && !requests.length && <p className="empty">Quiet lanes right now. Be the first to post: early plans earn the most kaju.</p>}
          {offers.length > 0 && <h3>Seats going</h3>}
          {offers.map(({ plan, user: u }) => (
            <div key={plan.id} className="line">
              <span className="who"><Face u={u} /><span>{vehicleEmoji(u.vehicle)} <b>{u.name}</b> · {istHHMM(plan.departAt)} {placeName(plan.fromPlace)} → <b>{placeName(plan.toPlace)}</b> · {plan.seats} seat{plan.seats > 1 ? "s" : ""}</span></span>
              <ActButton body={{ action: "hop", id: plan.id }} done="You're on! Check Telegram. 🛵">Hop on</ActButton>
            </div>
          ))}
          {requests.length > 0 && <h3>People looking for a ride</h3>}
          {requests.map(({ plan, user: u }) => (
            <div key={plan.id} className="line">
              <span className="who"><Face u={u} /><span><b>{u.name}</b> · {istHHMM(plan.departAt)} {placeName(plan.fromPlace)} → <b>{placeName(plan.toPlace)}</b></span></span>
              {user.vehicle !== "none" && <ActButton body={{ action: "take", id: plan.id }} done="Matched! Check Telegram. 🛵">I&apos;ll take them</ActButton>}
            </div>
          ))}
        </section>

        <section className="card float-card">
          <h2>🌴 Float</h2>
          {myFloat ? (
            <div className="line">
              <span>You&apos;re floating near <b>{nearestPlace(myFloat.f).place.name}</b> since {istHHMM(myFloat.f.startedAt)}. 5 kaju every 15 minutes.</span>
              <ActButton body={{ action: "stopFloat" }} className="btn small ghost">Stop</ActButton>
            </div>
          ) : (
            <p>Nowhere to be? In <a href={`https://t.me/${env.botUsername()}`}>the bot</a>, tap 📎 → Location → <b>Share My Live Location</b>. We&apos;ll ping you when someone nearby needs a ride. Floaters earn the most, and floaters say yes: turning down a nearby request ends your float and costs 10 kaju.</p>
          )}
          {floats.filter((f) => f.u.id !== user.id).length > 0 && (
            <p className="hint">Floating now: {floats.filter((f) => f.u.id !== user.id).map((f) => `${f.u.name} (near ${nearestPlace(f.f).place.name})`).join(", ")}</p>
          )}
        </section>

        <section className="card">
          <h2>🥜 {kaju} kaju</h2>
          <ul className="ledger">
            {hist.map((h) => (
              <li key={h.id}><span className={h.amount < 0 ? "minus" : "plus"}>{h.amount > 0 ? "+" : ""}{h.amount}</span> {REASON_LABEL[h.reason] ?? h.reason}</li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
