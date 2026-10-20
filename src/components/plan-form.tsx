"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { act } from "./act";

const WHEN = [
  ["now", "Now"], ["+30", "In 30 min"], ["+60", "In 1 h"], ["+120", "In 2 h"], ["+180", "In 3 h"], ["+300", "In 5 h"],
] as const;

export type PickPlace = { id: string; name: string; kind: string };
export type PickEvent = { id: string; label: string; leaveAt: string }; // leaveAt like "6:45pm" (IST)
const NEW = "+new";
const ERRAND = "errand";
const OPEN = "open";
const RANGES = [2, 5, 10, 15];
const mins = (km: number) => Math.max(3, Math.round((km / 25) * 60));
const icon = (k: string) => (k === "hub" ? "⭐ " : k === "event" ? "🍲 " : k === "stay" ? "🏡 " : "");

function PlaceSelect({ label, value, onChange, places, errand, open, events = [], typed, onTyped }: {
  label: string; value: string; onChange: (v: string) => void; places: PickPlace[]; errand?: boolean; open?: boolean; events?: PickEvent[]; typed: string; onTyped: (v: string) => void;
}) {
  return (
    <label>{label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {errand && <option value={ERRAND}>🧺 Quick errand nearby &amp; back</option>}
        {open && <option value={OPEN}>🧭 Open: I&apos;ll say how far</option>}
        {events.length > 0 && (
          <optgroup label="📅 Events coming up">
            {events.map((e) => <option key={e.id} value={`ev:${e.id}`}>{e.label}</option>)}
          </optgroup>
        )}
        {places.map((p) => <option key={p.id} value={p.id}>{icon(p.kind)}{p.name}</option>)}
        <option value={NEW}>➕ Somewhere else…</option>
      </select>
      {value === NEW && <input className="chip-input wide" placeholder="e.g. Banyan stay" value={typed} onChange={(e) => onTyped(e.target.value)} aria-label={`${label}: place name`} maxLength={40} />}
    </label>
  );
}

export function PlanForm({ hasWheels, maxSeats = 2, car = false, places, events = [] }: { hasWheels: boolean; maxSeats?: number; car?: boolean; places: PickPlace[]; events?: PickEvent[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"offer" | "request">(hasWheels ? "offer" : "request");
  const [from, setFrom] = useState("circle");
  const [to, setTo] = useState("riva");
  const [fromName, setFromName] = useState("");
  const [toName, setToName] = useState("");
  const [note, setNote] = useState("");
  const [range, setRange] = useState(5);
  const [when, setWhen] = useState("+120");
  const [custom, setCustom] = useState("");
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if ((from === NEW && !fromName.trim()) || (to === NEW && !toName.trim())) throw new Error("Type the place's name.");
      const r = await act({
        action: "plan", kind, from, to, when: custom.trim() || when, seats: kind === "offer" ? seats : undefined,
        fromName: from === NEW ? fromName : undefined, toName: to === NEW ? toName : undefined,
        note: (to === ERRAND || to === OPEN) && note.trim() ? note.trim() : undefined,
        rangeKm: to === OPEN ? range : undefined,
      });
      setMsg(`Posted! +${r.kaju} kaju${r.pinged ? `, and ${r.pinged} ${r.pinged === 1 ? "person" : "people"} pinged` : ""}. 🥜`);
      setCustom("");
      setFromName("");
      setToName("");
      setNote("");
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="plan-form" onSubmit={submit}>
      <div className="seg" role="radiogroup" aria-label="Pilot or hitcher">
        <button type="button" role="radio" aria-checked={kind === "offer"} className={kind === "offer" ? "on" : ""} onClick={() => { setKind("offer"); if (to === ERRAND) setTo("riva"); }}>{car ? "🚗" : "🛵"} I&apos;m going</button>
        <button type="button" role="radio" aria-checked={kind === "request"} className={kind === "request" ? "on" : ""} onClick={() => setKind("request")}>🙋 I need a ride</button>
      </div>
      <div className="row2">
        <PlaceSelect label="From" value={from} onChange={setFrom} places={places} typed={fromName} onTyped={setFromName} />
        <PlaceSelect label="To" value={to} onChange={(v) => { setTo(v); const ev = events.find((e) => `ev:${e.id}` === v); if (ev) setCustom(ev.leaveAt); }} places={places} errand={kind === "request"} open events={events} typed={toName} onTyped={setToName} />
      </div>
      {to === OPEN && (
        <fieldset className="when">
          <legend>{kind === "offer" ? "Happy to drop someone up to…" : "Roughly how far from the pickup?"} <span className="hint">The other person sees this; sort out exactly where when you meet</span></legend>
          <div className="chips">
            {RANGES.map((k) => (
              <button type="button" key={k} className={`chip ${range === k ? "on" : ""}`} onClick={() => setRange(k)}>~{k} km · {mins(k)} min</button>
            ))}
          </div>
          <input className="chip-input wide" placeholder="Where, roughly? (optional, e.g. towards Morjim)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} aria-label="Where, roughly" />
        </fieldset>
      )}
      {to === ERRAND && (
        <label>What&apos;s the errand? <span className="hint">A floater near “From” takes you and brings you back</span>
          <input className="chip-input wide" placeholder="pharmacy, ATM, laundry…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
        </label>
      )}
      <fieldset className="when">
        <legend>Around when? <span className="hint">Earlier plans earn more kaju</span></legend>
        <div className="chips">
          {WHEN.map(([v, label]) => (
            <button type="button" key={v} className={`chip ${when === v && !custom ? "on" : ""}`} onClick={() => { setWhen(v); setCustom(""); }}>{label}</button>
          ))}
          <input className="chip-input" placeholder="or 4:30pm" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Exact time" />
        </div>
      </fieldset>
      {kind === "offer" && maxSeats > 1 && (
        <label className="seats">Seats free
          <select value={seats} onChange={(e) => setSeats(Number(e.target.value))}>{Array.from({ length: Math.max(1, maxSeats) }, (_, i) => i + 1).map((s) => <option key={s}>{s}</option>)}</select>
        </label>
      )}
      <button className="btn" disabled={busy}>{kind === "offer" ? "Post my ride" : "Find me a ride"}</button>
      {msg && <p className="form-msg" role="status">{msg}</p>}
    </form>
  );
}
