"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PickPlace = { id: string; name: string; kind: string };
export type PickEvent = { id: string; title: string; time: string; place: string; leaveAt: string }; // leaveAt "HH:MM" IST
export type Extra = { value: string; icon: string; label: string; hint: string };

const loose = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
const icon = (k: string) => (k === "hub" ? "⭐" : k === "event" ? "🍲" : k === "stay" ? "🏡" : "📍");

/**
 * A bottom sheet for picking a place on a phone: big rows, a search box, sections (special options, hubs, events
 * coming up, everywhere else), and "➕ Add …" for a place that isn't there yet.
 */
export function PlacePicker({ title, places, events = [], extras = [], onPick, onClose }: {
  title: string;
  places: PickPlace[];
  events?: PickEvent[];
  extras?: Extra[];
  onPick: (value: string, label: string, ev?: PickEvent) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    sheet.current?.focus();
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, [onClose]);

  const lq = loose(q);
  const match = (s: string) => !lq || loose(s).includes(lq);
  const hubs = places.filter((p) => p.kind === "hub" && match(p.name));
  const rest = places.filter((p) => p.kind !== "hub" && match(p.name));
  const evs = events.filter((e) => match(e.title) || match(e.place));
  const exact = useMemo(() => places.some((p) => loose(p.name) === lq), [places, lq]);

  const Row = ({ value, label, sub, ico, ev, picked }: { value: string; label: string; sub?: string; ico: string; ev?: PickEvent; picked?: string }) => (
    <li>
      <button type="button" className="pick-row" onClick={() => onPick(value, picked ?? label, ev)}>
        <span className="pick-ico" aria-hidden>{ico}</span>
        <span className="pick-text"><b>{label}</b>{sub && <small>{sub}</small>}</span>
      </button>
    </li>
  );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={sheet} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="sheet-grip" aria-hidden />
          <h3>{title}</h3>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <input
          className="sheet-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search, or type a new place" aria-label="Search places" autoComplete="off" enterKeyHint="done"
        />
        <div className="sheet-body">
          {!q && extras.length > 0 && (
            <ul className="pick-list">{extras.map((x) => <Row key={x.value} value={x.value} label={x.label} sub={x.hint} ico={x.icon} />)}</ul>
          )}
          {hubs.length > 0 && (<><h4>Hubs</h4><ul className="pick-list">{hubs.map((p) => <Row key={p.id} value={p.id} label={p.name} ico={icon(p.kind)} />)}</ul></>)}
          {evs.length > 0 && (
            <>
              <h4>📅 Events coming up</h4>
              <ul className="pick-list">{evs.map((e) => <Row key={e.id} value={`ev:${e.id}`} label={e.title} sub={`${e.time} · ${e.place}`} ico="📅" ev={e} />)}</ul>
            </>
          )}
          {rest.length > 0 && (<><h4>{q ? "Places" : "Everywhere else (most used first)"}</h4><ul className="pick-list">{rest.map((p) => <Row key={p.id} value={p.id} label={p.name} ico={icon(p.kind)} />)}</ul></>)}
          {q.trim().length >= 2 && !exact && (
            <ul className="pick-list"><Row value="+new" picked={q.trim()} label={`Add “${q.trim()}”`} sub="A new place, for everyone. You can drop a pin for it in the bot." ico="➕" /></ul>
          )}
          {!hubs.length && !rest.length && !evs.length && q.trim().length < 2 && <p className="empty">Type at least two letters.</p>}
        </div>
      </div>
    </div>
  );
}
