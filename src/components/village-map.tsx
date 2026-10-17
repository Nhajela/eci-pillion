"use client";

import { useEffect, useRef } from "react";
import { useAvatar } from "./avatar-store";
import { PLACES, placeById } from "@/lib/places";

export type MapPerson = { id: number; name: string; avatar: string | null; scooty: string; vehicle?: string; floatAt?: string };

// A toy map of the village (not to scale, west is the sea). Avatars ride along the lanes.
const LANES = [
  "M120 90 C 260 120, 330 210, 470 230 S 720 200, 880 120",
  "M470 230 C 480 330, 420 420, 300 500",
  "M470 230 C 600 300, 700 360, 860 470",
  "M160 330 C 280 300, 380 280, 470 230",
  "M300 500 C 480 520, 650 520, 860 470",
];



type Rider = {
  lane: number; speed: number; offset: number; scooty: string; face: string;
  hitcher?: string; mine?: boolean; drawing?: string | null; label?: string; car?: boolean;
};

const RIDERS: Rider[] = [
  { lane: 0, speed: 0.045, offset: 0.1, scooty: "#7fd1b9", face: "#f2b48f", hitcher: "#c98b62" },
  { lane: 1, speed: 0.06, offset: 0.5, scooty: "#ffd23f", face: "#8d5a3b", hitcher: "#f6cfae" },
  { lane: 2, speed: 0.05, offset: 0.3, scooty: "#ff6b35", face: "#d9a07a" },
  { lane: 3, speed: 0.07, offset: 0.8, scooty: "#5b8def", face: "#6e4630", hitcher: "#e8b894" },
  { lane: 4, speed: 0.04, offset: 0.6, scooty: "#b28dff", face: "#f0c4a0" },
  { lane: 0, speed: 0.035, offset: 0.65, scooty: "#ff7eb6", face: "#a86f4c" },
];

function Head({ x, colour, id }: { x: number; colour: string; id: string }) {
  return (
    <g transform={`translate(${x},-24)`} data-id={id}>
      <circle r="9" fill={colour} stroke="#3b2418" strokeWidth="2" />
      <path d="M-9 -1 A9 9 0 0 1 9 -1 Z" fill="#fff6e6" stroke="#3b2418" strokeWidth="2" />
      <circle cx="-3" cy="3" r="1.3" fill="#3b2418" />
      <circle cx="3" cy="3" r="1.3" fill="#3b2418" />
    </g>
  );
}

function Car({ colour }: { colour: string }) {
  return (
    <g>
      <path d="M-26 -2 L -26 -12 Q -24 -18 -16 -18 L -10 -28 Q -8 -31 -3 -31 L 12 -31 Q 17 -31 19 -27 L 24 -18 Q 28 -17 28 -12 L 28 -2 Z"
        fill={colour} stroke="#3b2418" strokeWidth="2" strokeLinejoin="round" />
      <path d="M-6 -27 L 10 -27 L 15 -19 L -11 -19 Z" fill="#cfeff0" stroke="#3b2418" strokeWidth="1.5" />
      <circle cx="-15" cy="1" r="6" fill="#3b2418" />
      <circle cx="17" cy="1" r="6" fill="#3b2418" />
    </g>
  );
}

function Scooty({ colour }: { colour: string }) {
  return (
    <g>
      <path d="M-18 -4 Q -16 -14 -2 -14 L 10 -14 L 16 -22 L 19 -21 L 14 -10 Q 18 -4 18 0 L -18 0 Z"
        fill={colour} stroke="#3b2418" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="-12" cy="2" r="5" fill="#3b2418" />
      <circle cx="13" cy="2" r="5" fill="#3b2418" />
    </g>
  );
}

export function VillageMap({ people }: { people?: MapPerson[] } = {}) {
  const svg = useRef<SVGSVGElement>(null);
  const avatar = useAvatar();

  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const lanes = Array.from(root.querySelectorAll<SVGPathElement>("[data-lane]"));
    const riders = Array.from(root.querySelectorAll<SVGGElement>("[data-rider]"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = reduce ? 0 : (now - start) / 1000;
      for (const g of riders) {
        const lane = lanes[Number(g.dataset.lane)];
        const len = lane.getTotalLength();
        // ping-pong along the lane, so riders go there and back
        const raw = (Number(g.dataset.offset) + t * Number(g.dataset.speed)) % 2;
        const p = raw > 1 ? 2 - raw : raw;
        const a = lane.getPointAtLength(p * len);
        const b = lane.getPointAtLength(Math.min(len, p * len + 1));
        const facingLeft = raw > 1 ? b.x > a.x : b.x < a.x;
        g.setAttribute("transform", `translate(${a.x},${a.y - 6}) scale(${facingLeft ? -1.5 : 1.5},1.5)`);
        // keep a drawn face readable: undo the mirror on it
        const face = g.querySelector<SVGGElement>("[data-face]");
        if (face) face.setAttribute("transform", `${face.dataset.base ?? "translate(-2,-30)"} scale(${facingLeft ? -1 : 1},1)`);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [avatar]);

  const real = people?.length ? people : null;
  const mine: Rider | null = avatar && !real
    ? { lane: 3, speed: 0.055, offset: 0.2, scooty: avatar.scooty, face: "", mine: true, drawing: avatar.drawing, label: avatar.name }
    : null;
  const riders: Rider[] = real
    ? real.filter((p) => !p.floatAt).map((p, i) => ({
        lane: p.id % LANES.length, speed: 0.035 + ((p.id * 7) % 5) * 0.008, offset: (i * 0.37) % 1,
        scooty: p.scooty, face: "#e8b894", mine: Boolean(p.avatar), drawing: p.avatar, label: p.name, car: p.vehicle === "car",
      }))
    : mine ? [...RIDERS, mine] : RIDERS;
  const floaters = real?.filter((p) => p.floatAt) ?? [];
  const all = riders;

  return (
    <svg ref={svg} viewBox="0 0 1000 600" className="village-map" role="img"
      aria-label="A toy map of the village with little scooters riding between Arambol, the Circle, Riva, Mandrem beach, Ashwem and Morjim">
      <defs>
        <pattern id="waves" width="40" height="20" patternUnits="userSpaceOnUse">
          <path d="M0 10 Q 10 0 20 10 T 40 10" fill="none" stroke="#9fe0dc" strokeWidth="2" />
        </pattern>
        <clipPath id="face-clip"><circle r="15" /></clipPath>
      </defs>
      <rect width="1000" height="600" fill="#fdf1d8" />
      <path d="M0 0 L 70 0 C 40 150, 110 300, 60 420 S 90 560, 60 600 L 0 600 Z" fill="#4fb3b0" />
      <path d="M0 0 L 70 0 C 40 150, 110 300, 60 420 S 90 560, 60 600 L 0 600 Z" fill="url(#waves)" />
      <path d="M70 0 C 40 150, 110 300, 60 420 S 90 560, 60 600 L 110 600 C 140 520, 110 430, 130 360 S 90 140, 120 0 Z" fill="#f7dfa5" />
      {[[240, 380], [620, 140], [760, 280], [380, 120], [560, 440], [920, 300], [200, 210], [700, 560]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x},${y})`}>
          <path d="M0 0 L 2 -34" stroke="#8a5a3a" strokeWidth="4" strokeLinecap="round" />
          <path d="M2 -34 q -18 -4 -24 8 M2 -34 q 18 -6 24 6 M2 -34 q -6 -16 -18 -16 M2 -34 q 8 -16 20 -14"
            stroke="#3f9b5a" strokeWidth="6" fill="none" strokeLinecap="round" />
        </g>
      ))}
      {LANES.map((d, i) => (
        <g key={i}>
          <path d={d} stroke="#e07a4f" strokeWidth="22" fill="none" strokeLinecap="round" />
          <path data-lane={i} d={d} stroke="#f4a97f" strokeWidth="2" strokeDasharray="8 10" fill="none" />
        </g>
      ))}
      {all.map((r, i) => (
        <g key={i} data-rider data-lane={r.lane} data-speed={r.speed} data-offset={r.offset}>
          {r.car ? <Car colour={r.scooty} /> : <Scooty colour={r.scooty} />}
          {r.mine && r.drawing ? (
            <g data-face data-base={r.car ? "translate(2,-46)" : "translate(-2,-30)"} transform={r.car ? "translate(2,-46)" : "translate(-2,-30)"}>
              <circle r="17" fill="#fff" stroke="#3b2418" strokeWidth="3" />
              <image href={r.drawing} x="-15" y="-15" width="30" height="30" clipPath="url(#face-clip)" />
            </g>
          ) : (
            <>
              <Head x={2} colour={r.face} id="pilot" />
              {r.hitcher && <Head x={-12} colour={r.hitcher} id="hitcher" />}
            </>
          )}
        </g>
      ))}
      {PLACES.map((p) => (
        <g key={p.id} transform={`translate(${p.map.x},${p.map.y})`}>
          <circle r="11" fill="#fff6e6" stroke="#3b2418" strokeWidth="3" />
          <circle r="4" fill="#ff7eb6" />
          <text y="-18" textAnchor="middle" className="map-label">{p.name}</text>
        </g>
      ))}
      {floaters.map((f, i) => {
        const p = placeById(f.floatAt!)!;
        const dx = ((i % 3) - 1) * 34;
        return (
          <g key={`f${f.id}`} className="floater" transform={`translate(${p.map.x + dx},${p.map.y + 34})`}>
            <title>{`${f.name} is floating near ${p.name}`}</title>
            <circle r="22" fill="#ffd23f" opacity="0.35" className="float-glow" />
            {f.vehicle === "car" ? <Car colour={f.scooty} /> : <Scooty colour={f.scooty} />}
            <g transform="translate(-2,-30)">
              <circle r="17" fill="#fff" stroke="#3b2418" strokeWidth="3" />
              {f.avatar ? <image href={f.avatar} x="-15" y="-15" width="30" height="30" clipPath="url(#face-clip)" /> : <Head x={0} colour="#e8b894" id="floater" />}
            </g>
          </g>
        );
      })}
      {avatar && !real && (
        <g transform="translate(500,40)">
          <rect x="-140" y="-22" width="290" height="38" rx="19" fill="#3b2418" />
          <text x="5" y="3" textAnchor="middle" className="map-you">
            {`${avatar.name || "You"} is on the map ✨`}
          </text>
        </g>
      )}
    </svg>
  );
}
