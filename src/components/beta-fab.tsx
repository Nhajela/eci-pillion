"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { act } from "./act";

/** Small "beta" button that floats in a corner of every page: report a bug or suggest an idea. */
export function BetaFab({ loggedIn, bot }: { loggedIn: boolean; bot: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"bug" | "feature">("bug");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await act({ action: "report", kind, text, page: path });
      setMsg(`Thank you! #${r.id} is with the team. We'll message you on Telegram when it's sorted.`);
      setText("");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="beta-fab" aria-label="Beta: report a bug or suggest an idea" aria-expanded={open} aria-controls="beta-sheet" onClick={() => setOpen(!open)}>
        <span aria-hidden>🧪</span> Beta · feedback
      </button>
      {open && (
        <div id="beta-sheet" className="beta-sheet" role="dialog" aria-label="Report a bug or suggest an idea">
          <div className="beta-sheet-head">
            <b>Pillion is a beta.</b>
            <button type="button" className="linkish close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>
          <p className="hint">An experiment in sharing rides. Something broken, or something you wish it did? Tell us. It goes straight to the team.</p>
          <div className="seg" role="radiogroup" aria-label="Bug or idea">
            <button type="button" role="radio" aria-checked={kind === "bug"} className={kind === "bug" ? "on" : ""} onClick={() => setKind("bug")}>🐞 Bug</button>
            <button type="button" role="radio" aria-checked={kind === "feature"} className={kind === "feature" ? "on" : ""} onClick={() => setKind("feature")}>💡 Idea</button>
          </div>
          {loggedIn ? (
            <form onSubmit={send} className="beta-form">
              <textarea
                value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} required
                placeholder={kind === "bug" ? "What did you tap, and what happened?" : "What should Pillion do?"}
              />
              <button className="btn small" disabled={busy || text.trim().length < 3}>Send</button>
            </form>
          ) : bot ? (
            <p>
              <a className="btn small" href={`https://t.me/${bot}?start=${kind}`}>Tell the bot</a>
              <span className="hint"> or type <b>/{kind}</b> and your message in <a href={`https://t.me/${bot}`}>@{bot}</a>.</span>
            </p>
          ) : (
            <p className="hint">Log in first, then tell us here.</p>
          )}
          {msg && <p className="form-msg" role="status">{msg}</p>}
        </div>
      )}
    </>
  );
}
