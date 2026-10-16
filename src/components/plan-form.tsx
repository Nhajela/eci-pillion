"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PLACES } from "@/lib/places";
import { act } from "./act";

const WHEN = [
  ["now", "Now"], ["+30", "In 30 min"], ["+60", "In 1 h"], ["+120", "In 2 h"], ["+180", "In 3 h"], ["+300", "In 5 h"],
] as const;

export function PlanForm({ hasWheels }: { hasWheels: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<"offer" | "request">(hasWheels ? "offer" : "request");
  const [from, setFrom] = useState("circle");
  const [to, setTo] = useState("arambol");
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
      const r = await act({ action: "plan", kind, from, to, when: custom.trim() || when, seats: kind === "offer" ? seats : undefined });
      setMsg(`Posted! +${r.kaju} kaju${r.pinged ? `, and ${r.pinged} ${r.pinged === 1 ? "person" : "people"} pinged` : ""}. 🥜`);
      setCustom("");
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
        <button type="button" role="radio" aria-checked={kind === "offer"} className={kind === "offer" ? "on" : ""} onClick={() => setKind("offer")}>🛵 I&apos;m going</button>
        <button type="button" role="radio" aria-checked={kind === "request"} className={kind === "request" ? "on" : ""} onClick={() => setKind("request")}>🙋 I need a ride</button>
      </div>
      <div className="row2">
        <label>From<select value={from} onChange={(e) => setFrom(e.target.value)}>{PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>To<select value={to} onChange={(e) => setTo(e.target.value)}>{PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      </div>
      <fieldset className="when">
        <legend>Around when? <span className="hint">Earlier plans earn more kaju</span></legend>
        <div className="chips">
          {WHEN.map(([v, label]) => (
            <button type="button" key={v} className={`chip ${when === v && !custom ? "on" : ""}`} onClick={() => { setWhen(v); setCustom(""); }}>{label}</button>
          ))}
          <input className="chip-input" placeholder="or 4:30pm" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Exact time" />
        </div>
      </fieldset>
      {kind === "offer" && (
        <label className="seats">Seats free
          <select value={seats} onChange={(e) => setSeats(Number(e.target.value))}>{[1, 2, 3].map((s) => <option key={s}>{s}</option>)}</select>
        </label>
      )}
      <button className="btn" disabled={busy}>{kind === "offer" ? "Post my ride" : "Find me a ride"}</button>
      {msg && <p className="form-msg" role="status">{msg}</p>}
    </form>
  );
}
