"use client";

import { useState } from "react";

// A toy, not the real matcher: shows why telling the village early helps.
export function EarlySlider() {
  const [hours, setHours] = useState(3);
  const kaju = hours >= 2 ? 15 : hours >= 0.5 ? 10 : 5;
  const chance = Math.round(35 + 60 * (1 - Math.exp(-hours / 2)));
  const label = hours === 0 ? "right now" : hours < 1 ? `${Math.round(hours * 60)} min ahead` : `${hours} h ahead`;
  return (
    <div className="slider-card">
      <label htmlFor="early">I&apos;m telling the village <b>{label}</b></label>
      <input id="early" type="range" min={0} max={8} step={0.5} value={hours}
        onChange={(e) => setHours(Number(e.target.value))} />
      <div className="slider-out">
        <div><span className="big">+{kaju}</span><span>kaju for posting</span></div>
        <div><span className="big">{chance}%</span><span>pretend chance of a match</span></div>
      </div>
    </div>
  );
}
