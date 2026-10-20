"use client";

import { useState } from "react";

export type Beat = { time: string; who: string; title: string; body: string; gif?: string; kaju?: string };

/** "Play it out": one village day, tap by tap. */
export function DayStory({ beats }: { beats: Beat[] }) {
  const [i, setI] = useState(0);
  const b = beats[i];
  return (
    <div className="story">
      <ol className="story-dots" aria-label="Steps">
        {beats.map((x, k) => (
          <li key={k}>
            <button type="button" aria-current={k === i ? "step" : undefined} className={k === i ? "on" : k < i ? "past" : ""} onClick={() => setI(k)}>
              <span className="sr-only">{x.time}: {x.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="story-card" aria-live="polite">
        {b.gif ? <img src={b.gif} alt="" width={480} height={270} className="story-gif" /> : null}
        <p className="story-time">{b.time} · {b.who}</p>
        <h3>{b.title}</h3>
        <p>{b.body}</p>
        {b.kaju && <p className="story-kaju">🥜 {b.kaju}</p>}
      </div>
      <div className="story-nav">
        <button type="button" className="btn small ghost" disabled={i === 0} onClick={() => setI(i - 1)}>← Before</button>
        <span className="hint">{i + 1} / {beats.length}</span>
        <button type="button" className="btn small" disabled={i === beats.length - 1} onClick={() => setI(i + 1)}>Then →</button>
      </div>
    </div>
  );
}
