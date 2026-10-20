import type { User } from "@/db/schema";
import { ActButton } from "@/components/act";
import { AddPlace, PlaceEditor, RoleSelect } from "@/components/admin-forms";
import { db } from "@/db";
import { vehicleEmoji } from "@/lib/kaju";
import { destName, nearestPlace, placeName } from "@/lib/places";
import { istHHMM } from "@/lib/time";
import { dashboard } from "@/services/dashboard";

const STATUS_NEXT: Record<string, [string, string][]> = {
  new: [["doing", "On it"], ["done", "Done ✓"], ["wontdo", "Won't do"]],
  doing: [["done", "Done ✓"], ["wontdo", "Won't do"], ["new", "Back to new"]],
  done: [["new", "Reopen"]],
  wontdo: [["new", "Reopen"]],
};
const STATUS_LABEL: Record<string, string> = { new: "new", doing: "doing", done: "done", wontdo: "won't do" };
const when = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Admin (canEdit) and staff (read-only) see the same thing. */
export async function Dashboard({ me, canEdit }: { me: User; canEdit: boolean }) {
  const now = new Date();
  const d = await dashboard(db(), now);
  const s = d.stats;
  return (
    <main className="app">
      <h1>{canEdit ? "Admin" : "Staff"} dashboard <span className="beta-pill">beta</span></h1>
      <p className="hint">As of {istHHMM(now)} IST (reload for fresh numbers).</p>
      {!canEdit && <p className="readonly-note">👀 Staff view: you can see everything, admins change things.</p>}

      <section className="card">
        <h2>Today</h2>
        <div className="stats">
          <div className="stat"><b>{s.people}</b><span>signed up ({s.joinedToday} today)</span></div>
          <div className="stat"><b>{s.plansToday}</b><span>plans posted today</span></div>
          <div className="stat"><b>{s.ridesDoneToday}</b><span>rides done today</span></div>
          <div className="stat"><b>{d.upcoming.length}</b><span>rides matched, not done</span></div>
          <div className="stat"><b>{s.floatingNow}</b><span>floating now</span></div>
          <div className="stat"><b>{s.kajuToday}</b><span>kaju net today</span></div>
          <div className="stat"><b>{s.openReports}</b><span>open bugs + ideas</span></div>
        </div>
      </section>

      <section className="card" id="reports">
        <h2>🐞 Bugs and 💡 ideas</h2>
        {!d.reports.length && <p className="empty">Nothing yet. People report with /bug or /feature in the bot, or the beta button on the site.</p>}
        {d.reports.map(({ r, u }) => (
          <div key={r.id} className="line">
            <span>
              <span className={`st-tag ${r.status}`}>{STATUS_LABEL[r.status]}</span> {r.kind === "bug" ? "🐞" : "💡"} <b>#{r.id}</b> · {u ? <>{u.name}{u.username && <> (<a href={`https://t.me/${u.username}`}>@{u.username}</a>)</>}</> : "anonymous"} · {when(r.createdAt)} · {r.source}{r.page ? ` ${r.page}` : ""}
              <span className="report-text">{r.text}</span>
            </span>
            {canEdit && (
              <span className="btns">
                {STATUS_NEXT[r.status]?.map(([st, label]) => (
                  <ActButton key={st} body={{ action: "reportStatus", id: r.id, status: st }} className="btn small ghost">{label}</ActButton>
                ))}
              </span>
            )}
          </div>
        ))}
        {canEdit && <p className="hint">Marking done or won&apos;t do sends the reporter a thank-you on Telegram.</p>}
      </section>

      <section className="card">
        <h2>On the road</h2>
        <h3>Matched rides</h3>
        {!d.upcoming.length && <p className="empty">None right now.</p>}
        {d.upcoming.map((r) => (
          <div key={r.id} className="line"><span><b>{istHHMM(r.departAt)}</b> {placeName(r.fromPlace)} → <b>{destName(r.toPlace, null, r.rangeKm)}</b> · {r.pilot} taking {r.hitcher}{r.viaFloat ? " 🌴" : ""}</span></div>
        ))}
        <h3>Open plans</h3>
        {!d.board.length && <p className="empty">None right now.</p>}
        {d.board.map(({ plan: p, user: u }) => (
          <div key={p.id} className="line">
            <span>{p.kind === "offer" ? `${vehicleEmoji(u.vehicle)} offer` : "🙋 request"} · <b>{istHHMM(p.departAt)}</b> {placeName(p.fromPlace)} → <b>{destName(p.toPlace, p.note, p.rangeKm)}</b> · {u.name}{p.kind === "offer" ? ` · ${p.seats} seat${p.seats > 1 ? "s" : ""}` : ""} · posted {Math.round(p.leadMinutes / 60 * 10) / 10} h ahead</span>
          </div>
        ))}
        <h3>Floating</h3>
        {!d.floating.length && <p className="empty">Nobody right now.</p>}
        {d.floating.map(({ f, u }) => (
          <div key={f.id} className="line"><span>🌴 <b>{u.name}</b> near {nearestPlace(f).place?.name ?? "?"} since {istHHMM(f.startedAt)}, last seen {istHHMM(f.lastSeenAt)}</span></div>
        ))}
      </section>

      <section className="card" id="places">
        <h2>📍 Places</h2>
        <p className="hint">
          Hubs (⭐) show first in every picker, then events (🍲, e.g. tonight&apos;s dinner: update its pin and note each day), spots, and stays (🏡).
          Anyone can add a place by typing its name in the bot or on the site; places pinned within 600 m of each other count as the same destination.
        </p>
        {canEdit && <AddPlace />}
        {d.places.map((p) => (
          <div key={p.id} className="line">
            <span>
              {p.mergedInto ? "🔀 " : p.hidden ? "🙈 " : ""}<b>{p.name}</b>{p.mergedInto ? ` → merged into ${placeName(p.mergedInto)}` : ""} · {p.kind} · {p.lat != null ? "📍 pinned" : "no pin (name-only)"} · used {p.uses}×{p.addedBy ? ` · added by ${p.addedBy}` : ""}{p.note ? ` · ${p.note}` : ""}
              {canEdit && !p.mergedInto && (
                <details className="edit-place">
                  <summary>Edit</summary>
                  <PlaceEditor p={{ id: p.id, name: p.name, kind: p.kind, hidden: Boolean(p.hidden), note: p.note ?? null, lat: p.lat, lng: p.lng }} others={d.places.filter((o) => o.id !== p.id && !o.mergedInto).map((o) => ({ id: o.id, name: o.name }))} />
                </details>
              )}
            </span>
          </div>
        ))}
      </section>

      <section className="card" id="people">
        <h2>People</h2>
        {d.people.map(({ u, k }) => (
          <div key={u.id} className="line">
            <span>
              {vehicleEmoji(u.vehicle === "none" ? "scooty" : u.vehicle)}{u.vehicle === "none" ? " (no wheels)" : ""} <b>{u.name}</b>
              {u.username && <> · <a href={`https://t.me/${u.username}`}>@{u.username}</a></>} · 🥜 {k}{u.onboardedAt ? "" : " · not signed up yet"}
              {!canEdit && u.role !== "member" && <> · <span className="st-tag">{u.role}</span></>}
            </span>
            {canEdit && <RoleSelect id={u.id} role={u.role} self={u.id === me.id} />}
          </div>
        ))}
        {canEdit && <p className="hint">Staff see this dashboard read-only. Admins change things and get every bug and idea on Telegram.</p>}
      </section>
    </main>
  );
}
