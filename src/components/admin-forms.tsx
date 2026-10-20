"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { act } from "./act";

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (body: Record<string, unknown>, done = "Saved.") => {
    setBusy(true);
    setMsg(null);
    try {
      await act(body);
      setMsg(done);
      router.refresh();
      return true;
    } catch (e) {
      setMsg((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run };
}

export function RoleSelect({ id, role, self }: { id: number; role: string; self: boolean }) {
  const { busy, msg, run } = useAct();
  return (
    <span className="act">
      <select aria-label="Role" value={role} disabled={busy || self} onChange={(e) => run({ action: "setRole", id, role: e.target.value })} className="mini-select">
        <option value="member">member</option>
        <option value="staff">staff</option>
        <option value="admin">admin</option>
      </select>
      {msg && <span className="act-msg" role="status">{msg}</span>}
    </span>
  );
}

const KINDS = [["hub", "⭐ hub"], ["event", "🍲 event"], ["spot", "spot"], ["stay", "🏡 stay"]] as const;

export function PlaceEditor({ p }: { p: { id: string; name: string; kind: string; hidden: boolean; note: string | null; lat: number | null; lng: number | null } }) {
  const { busy, msg, run } = useAct();
  const [name, setName] = useState(p.name);
  const [kind, setKind] = useState(p.kind);
  const [note, setNote] = useState(p.note ?? "");
  const [pin, setPin] = useState(p.lat != null ? `${p.lat.toFixed(5)}, ${p.lng!.toFixed(5)}` : "");
  return (
    <form className="mini-form" onSubmit={(e) => { e.preventDefault(); run({ action: "savePlace", id: p.id, name, kind, note: note || null, pin }); }}>
      <input className="grow" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" maxLength={40} />
      <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <input className="grow" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="pin: 15.67, 73.71 or Maps link" aria-label="Pin" />
      <input className="grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (e.g. tonight at Riva lawn)" aria-label="Note" maxLength={120} />
      <button className="btn small" disabled={busy}>Save</button>
      <button type="button" className="btn small ghost" disabled={busy} onClick={() => run({ action: "savePlace", id: p.id, hidden: !p.hidden }, p.hidden ? "Shown again." : "Hidden from pickers.")}>{p.hidden ? "Unhide" : "Hide"}</button>
      {msg && <span className="act-msg" role="status">{msg}</span>}
    </form>
  );
}

export function AddPlace() {
  const { busy, msg, run } = useAct();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("stay");
  const [pin, setPin] = useState("");
  return (
    <form className="mini-form" onSubmit={async (e) => { e.preventDefault(); if (await run({ action: "addPlace", name, kind, pin }, "Added.")) { setName(""); setPin(""); } }}>
      <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Banyan stay" aria-label="New place name" required maxLength={40} />
      <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <input className="grow" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="pin (optional): 15.67, 73.71" aria-label="Pin" />
      <button className="btn small" disabled={busy || name.trim().length < 2}>Add place</button>
      {msg && <span className="act-msg" role="status">{msg}</span>}
    </form>
  );
}
