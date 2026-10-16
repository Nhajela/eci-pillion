"use client";

import { useEffect, useRef, useState } from "react";
import { loadAvatar, saveAvatar, SCOOTY_COLOURS } from "./avatar-store";

const INKS = ["#3b2418", "#ff6b35", "#ff7eb6", "#ffd23f", "#4fb3b0", "#3f9b5a", "#5b8def", "#ffffff"];
const SIZE = 280;

export function AvatarMaker() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState(INKS[0]);
  const [brush, setBrush] = useState(8);
  const [scooty, setScooty] = useState(SCOOTY_COLOURS[0]);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const paper = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#fff6e6";
    ctx.fillRect(0, 0, SIZE, SIZE);
  };

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    paper(ctx);
    const prev = loadAvatar();
    if (prev) {
      setName(prev.name);
      setScooty(prev.scooty);
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, SIZE, SIZE);
      img.src = prev.drawing;
      setSaved(true);
    }
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };

  const stroke = (to: { x: number; y: number }) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const from = last.current ?? to;
    ctx.strokeStyle = ink;
    ctx.lineWidth = brush;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.01, to.y);
    ctx.stroke();
    last.current = to;
  };

  const clear = () => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) paper(ctx);
    setSaved(false);
    setDirty(false);
  };

  const save = () => {
    const c = canvas.current;
    if (!c) return;
    // keep it small: it rides around in localStorage today and to the server later
    const small = document.createElement("canvas");
    small.width = small.height = 128;
    small.getContext("2d")?.drawImage(c, 0, 0, 128, 128);
    saveAvatar({ name: name.trim().slice(0, 24), drawing: small.toDataURL("image/png"), scooty, savedAt: Date.now() });
    setSaved(true);
    setDirty(false);
  };

  return (
    <div className="maker">
      <div className="maker-pad">
        <canvas
          ref={canvas}
          width={SIZE}
          height={SIZE}
          aria-label="Drawing pad for your avatar"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            last.current = null;
            stroke(point(e));
            setDirty(true);
            setSaved(false);
          }}
          onPointerMove={(e) => drawing.current && stroke(point(e))}
          onPointerUp={() => (drawing.current = false)}
          onPointerCancel={() => (drawing.current = false)}
        />
        <div className="maker-scooty" style={{ background: scooty }} aria-hidden />
      </div>
      <div className="maker-tools">
        <fieldset>
          <legend>Ink</legend>
          <div className="swatches">
            {INKS.map((c) => (
              <button key={c} type="button" className={`swatch ${ink === c ? "on" : ""}`}
                style={{ background: c }} aria-label={`Ink ${c}`} aria-pressed={ink === c}
                onClick={() => setInk(c)} />
            ))}
          </div>
          <div className="brushes">
            {[4, 8, 16, 28].map((b) => (
              <button key={b} type="button" className={`brush ${brush === b ? "on" : ""}`}
                aria-label={`Brush size ${b}`} aria-pressed={brush === b} onClick={() => setBrush(b)}>
                <span style={{ width: b, height: b }} />
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Pick scooty colour</legend>
          <div className="swatches">
            {SCOOTY_COLOURS.map((c) => (
              <button key={c} type="button" className={`swatch big ${scooty === c ? "on" : ""}`}
                style={{ background: c }} aria-label={`Scooty ${c}`} aria-pressed={scooty === c}
                onClick={() => { setScooty(c); setSaved(false); }} />
            ))}
          </div>
        </fieldset>
        <label className="maker-name">
          <span>What should the village call you?</span>
          <input value={name} maxLength={24} placeholder="e.g. Priya" onChange={(e) => { setName(e.target.value); setSaved(false); }} />
        </label>
        <div className="maker-actions">
          <button type="button" className="btn ghost" onClick={clear}>Clear</button>
          <button type="button" className="btn" onClick={save} disabled={saved && !dirty}>
            {saved && !dirty ? "Saved ✓" : "Save me"}
          </button>
        </div>
        <p className="maker-note" role="status">
          {saved ? "Saved in this browser. Your avatar's parked here till the bot arrives. Scroll up: you're on the map." : " "}
        </p>
      </div>
    </div>
  );
}
