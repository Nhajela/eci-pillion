"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { act } from "./act";

export function InviteCard({ link, share, joined, waiting, join, ride }: {
  link: string; share: string; joined: { id: number; name: string; rode: boolean }[]; waiting: string[]; join: number; ride: number;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card invite-cta" id="invite">
      <h2>💌 Bring everyone</h2>
      <p>Pillion works when lots of us are on it: every person who joins makes a ride likelier for you too. Send your link to your housemates, your residency group, your table at dinner. +{join} kaju when a friend signs up, +{ride} when they take their first ride.</p>
      <div className="invite-row">
        <span className="invite-link">{link}</span>
        <button type="button" className="btn small ghost" onClick={async () => { await navigator.clipboard?.writeText(link); setCopied(true); }}>{copied ? "Copied ✓" : "Copy"}</button>
        <a className="btn small" href={share}>📤 Share</a>
      </div>
      <form className="mini-form" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const r = await act({ action: "invite", username: name });
          setMsg(`Saved: when @${r.username} joins (link or not), the kaju is yours.`);
          setName("");
          router.refresh();
        } catch (err) {
          setMsg((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}>
        <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="or their Telegram @username" aria-label="Friend's Telegram username" autoCapitalize="none" spellCheck={false} />
        <button className="btn small ghost" disabled={busy || name.trim().length < 4}>Invite</button>
      </form>
      {msg && <p className="form-msg" role="status">{msg}</p>}
      {joined.length > 0 && <p><b>Joined through you:</b> {joined.map((j) => `${j.name}${j.rode ? " 🛵" : ""}`).join(", ")}</p>}
      {waiting.length > 0 && <p className="hint">Invited, not joined yet: {waiting.map((u) => `@${u}`).join(", ")}</p>}
    </section>
  );
}
