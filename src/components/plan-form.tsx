"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { act } from "./act";
import { PlacePicker, type Extra, type PickEvent, type PickPlace } from "./place-picker";

export type { PickEvent, PickPlace };

const WHEN = [
  ["now", "Now"], ["+30", "In 30 min"], ["+60", "In 1 h"], ["+120", "In 2 h"], ["+180", "In 3 h"], ["+300", "In 5 h"],
] as const;
const ERRAND = "errand";
const OPEN = "open";
const NEW = "+new";
const RANGES = [2, 5, 10, 15];
const mins = (km: number) => Math.max(3, Math.round((km / 25) * 60));
const icon = (k: string) => (k === "hub" ? "⭐" : k === "event" ? "🍲" : k === "stay" ? "🏡" : "📍");
// mirrors KAJU.planEarly / planSoon / planNow
const kajuFor = (leadMin: number) => (leadMin >= 120 ? 15 : leadMin >= 30 ? 10 : 5);

type Pick = { value: string; label: string; ico: string };

/** "18:45" → "6:45pm", like the rest of Pillion. */
const fmt12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};

function leadMinutes(when: string, time: string) {
  if (time) {
    const [h, m] = time.split(":").map(Number);
    const now = new Date();
    const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000); // wall clock in IST
    let diff = h * 60 + m - (ist.getHours() * 60 + ist.getMinutes());
    if (diff < -60) diff += 24 * 60;
    return Math.max(0, diff);
  }
  return when === "now" ? 0 : Number(when.slice(1));
}

/** Post a plan, phone-first: big choices, a searchable sheet for places, chips or a clock for the time. */
export function PlanForm({ hasWheels, maxSeats = 2, car = false, places, events = [] }: {
  hasWheels: boolean; maxSeats?: number; car?: boolean; places: PickPlace[]; events?: PickEvent[];
}) {
  const router = useRouter();
  const find = (id: string): Pick => {
    const p = places.find((x) => x.id === id);
    return { value: id, label: p?.name ?? id, ico: icon(p?.kind ?? "") };
  };
  const [kind, setKind] = useState<"offer" | "request">(hasWheels ? "offer" : "request");
  const [from, setFrom] = useState<Pick>(find("circle"));
  const [to, setTo] = useState<Pick | null>(null);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [note, setNote] = useState("");
  const [range, setRange] = useState(5);
  const [when, setWhen] = useState("+120");
  const [time, setTime] = useState("");
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const extrasTo: Extra[] = [
    ...(kind === "request" ? [{ value: ERRAND, icon: "🧺", label: "Quick errand nearby & back", hint: "Pharmacy, ATM, laundry: a floater near you takes you and brings you back" }] : []),
    { value: OPEN, icon: "🧭", label: kind === "offer" ? "Open: drop someone up to a distance" : "Open: I'll say how far", hint: "Pick ~2, 5, 10 or 15 km from the pickup; sort out exactly where when you meet" },
  ];

  const pick = (value: string, label: string, ev?: PickEvent) => {
    const which = picking;
    setPicking(null);
    if (which === "from") return setFrom(value === NEW ? { value: NEW, label, ico: "➕" } : find(value));
    if (ev) {
      setTo({ value, label: ev.title, ico: "📅" });
      setTime(ev.leaveAt);
      return;
    }
    if (value === ERRAND) return setTo({ value, label: "Quick errand & back", ico: "🧺" });
    if (value === OPEN) return setTo({ value, label: kind === "offer" ? "Open (up to a distance)" : "Open: I'll say how far", ico: "🧭" });
    setTo(value === NEW ? { value: NEW, label, ico: "➕" } : find(value));
  };

  const swap = () => {
    if (!to || to.value.startsWith("ev:") || to.value === ERRAND || to.value === OPEN) return;
    setTo(from);
    setFrom(to);
  };

  const lead = leadMinutes(when, time);
  const whenLabel = time ? `around ${fmt12(time)}` : WHEN.find(([v]) => v === when)?.[1].toLowerCase();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to) return setPicking("to");
    setBusy(true);
    setMsg(null);
    try {
      const r = await act({
        action: "plan", kind, from: from.value, to: to.value, when: time || when, seats: kind === "offer" ? seats : undefined,
        fromName: from.value === NEW ? from.label : undefined, toName: to.value === NEW ? to.label : undefined,
        note: (to.value === ERRAND || to.value === OPEN) && note.trim() ? note.trim() : undefined,
        rangeKm: to.value === OPEN ? range : undefined,
      });
      setMsg({ ok: true, text: `Posted! +${r.kaju} kaju${r.pinged ? `, and ${r.pinged} ${r.pinged === 1 ? "person" : "people"} pinged` : ""}. Watch Telegram for a match. 🥜` });
      setTo(null);
      setTime("");
      setNote("");
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="plan-form" onSubmit={submit}>
      <div className="seg big" role="radiogroup" aria-label="Pilot or hitcher">
        <button type="button" role="radio" aria-checked={kind === "request"} className={kind === "request" ? "on" : ""} onClick={() => { setKind("request"); }}>
          <span aria-hidden>🙋</span> I need a ride
        </button>
        <button type="button" role="radio" aria-checked={kind === "offer"} className={kind === "offer" ? "on" : ""} disabled={!hasWheels}
          onClick={() => { setKind("offer"); if (to?.value === ERRAND) setTo(null); }} title={hasWheels ? undefined : "Add your wheels with /wheels in the bot"}>
          <span aria-hidden>{car ? "🚗" : "🛵"}</span> I&apos;m going
        </button>
      </div>

      <div className="route">
        <button type="button" className="field-btn" onClick={() => setPicking("from")}>
          <span className="field-label">From</span>
          <span className="field-value"><span aria-hidden>{from.ico}</span> {from.label}</span>
          <span className="field-chev" aria-hidden>›</span>
        </button>
        <button type="button" className="swap" onClick={swap} aria-label="Swap from and to" disabled={!to || to.value.startsWith("ev:") || to.value === ERRAND || to.value === OPEN}>⇅</button>
        <button type="button" className={`field-btn ${to ? "" : "empty"}`} onClick={() => setPicking("to")}>
          <span className="field-label">To</span>
          <span className="field-value">{to ? <><span aria-hidden>{to.ico}</span> {to.label}</> : "Where to? Tap to choose"}</span>
          <span className="field-chev" aria-hidden>›</span>
        </button>
      </div>

      {to?.value === OPEN && (
        <div className="sub-panel">
          <p className="field-label">{kind === "offer" ? "Happy to drop someone up to…" : "Roughly how far from the pickup?"}</p>
          <div className="chips">
            {RANGES.map((k) => (
              <button type="button" key={k} className={`chip ${range === k ? "on" : ""}`} onClick={() => setRange(k)}>~{k} km · {mins(k)} min</button>
            ))}
          </div>
          <input className="text-in" placeholder="Where, roughly? (optional, e.g. towards Morjim)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} aria-label="Where, roughly" />
        </div>
      )}
      {to?.value === ERRAND && (
        <div className="sub-panel">
          <label className="field-label" htmlFor="errand">What&apos;s the errand?</label>
          <input id="errand" className="text-in" placeholder="pharmacy, ATM, laundry…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
        </div>
      )}

      <fieldset className="when">
        <legend className="field-label">When? <span className="hint">earlier plans earn more kaju</span></legend>
        <div className="chips">
          {WHEN.map(([v, label]) => (
            <button type="button" key={v} className={`chip ${when === v && !time ? "on" : ""}`} onClick={() => { setWhen(v); setTime(""); }}>{label}</button>
          ))}
          <label className={`chip time-chip ${time ? "on" : ""}`}>
            <span aria-hidden>🕐</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Pick a time" />
          </label>
        </div>
      </fieldset>

      {kind === "offer" && maxSeats > 1 && (
        <div className="stepper-row">
          <span className="field-label">Seats free</span>
          <div className="stepper">
            <button type="button" onClick={() => setSeats(Math.max(1, seats - 1))} disabled={seats <= 1} aria-label="One fewer seat">−</button>
            <b aria-live="polite">{seats}</b>
            <button type="button" onClick={() => setSeats(Math.min(maxSeats, seats + 1))} disabled={seats >= maxSeats} aria-label="One more seat">+</button>
          </div>
        </div>
      )}

      {to && (
        <p className="summary">
          {kind === "offer" ? `${car ? "🚗" : "🛵"} Offering ${seats} seat${seats > 1 ? "s" : ""}` : "🙋 Asking for a ride"}: <b>{from.label}</b> → <b>{to.label}</b>, {whenLabel}.{" "}
          <span className="summary-kaju">+{kajuFor(lead)} kaju</span>
        </p>
      )}
      <button className="btn wide" disabled={busy}>{!to ? "Choose where to" : kind === "offer" ? "Post my ride" : "Find me a ride"}</button>
      {msg && <p className={msg.ok ? "form-msg" : "form-msg warn"} role="status">{msg.text}</p>}

      {picking && (
        <PlacePicker
          title={picking === "from" ? "Starting from" : "Where to?"}
          places={places}
          events={picking === "to" ? events : []}
          extras={picking === "to" ? extrasTo : []}
          onPick={pick}
          onClose={() => setPicking(null)}
        />
      )}
    </form>
  );
}
