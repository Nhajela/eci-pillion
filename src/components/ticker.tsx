"use client";

import { useEffect, useState } from "react";

// What the bot will sound like. Made-up names, made-up rides.
const LINES = [
  "🛵 Floater spotted near Ashwem! Priya has a free seat and zero plans. Need a ride? She'll putter over.",
  "💞 Match made! Arjun (pilot) + Meera (hitcher) → Arambol, 4:15pm. Helmets on.",
  "🐦 Early bird of the day: Tanvi posted her Morjim run at 7:40am for 6pm. +15 kaju and our undying admiration.",
  "💊 Someone needs a ride to the pharmacy from Riva, now-ish. Any pilots nearby? Small kaju, big karma.",
  "🥜 Ride done, kaju spun: Rohan +30, Sana +10. Sana says Rohan drives like a monk.",
  "🏆 A floater is 5 kaju from the top, a pilot is 3 behind, and a hitcher named Dev is sneaking up on both.",
  "🏖️ Kabir floated for four hours and moved maybe 300 metres. Longest Float, obviously. +80 kaju.",
  "☀️ Sunday, susegad mode. Three scooties heading out around 11. Seats: 2. Early claims earn more.",
];

/** Real village happenings when there are some (`live`), the made-up samples until then. */
export function Ticker({ live = [] }: { live?: string[] }) {
  const real = live.length >= 2;
  const lines = real ? live : LINES;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % lines.length), 4500);
    return () => clearInterval(id);
  }, [lines.length]);
  return (
    <div className="ticker" aria-label={real ? "Live from the village" : "Sample messages from the Pillion bot"}>
      <span className="ticker-label">{real ? "live from the village" : "sample bot chatter"}</span>
      <p key={i} className="ticker-line">{lines[i % lines.length]}</p>
    </div>
  );
}
