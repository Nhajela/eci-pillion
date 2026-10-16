"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export async function act(body: Record<string, unknown>) {
  const res = await fetch("/api/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something wobbled.");
  return data;
}

/** A button that runs one action, shows the answer, and refreshes the page. */
export function ActButton({ body, children, className = "btn small", confirm, done }: {
  body: Record<string, unknown>; children: React.ReactNode; className?: string; confirm?: string; done?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="act">
      <button type="button" className={className} disabled={busy} onClick={async () => {
        if (confirm && !window.confirm(confirm)) return;
        setBusy(true);
        setMsg(null);
        try {
          await act(body);
          setMsg(done ?? null);
          router.refresh();
        } catch (e) {
          setMsg((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}>{children}</button>
      {msg && <span className="act-msg" role="status">{msg}</span>}
    </span>
  );
}
