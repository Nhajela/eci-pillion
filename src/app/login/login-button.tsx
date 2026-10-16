"use client";

import { useEffect, useRef, useState } from "react";

export function LoginButton() {
  const [code, setCode] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "waiting" | "expired" | "error">("idle");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!code) return;
    timer.current = setInterval(async () => {
      const r = await fetch(`/api/login/poll?code=${code}`).then((x) => x.json()).catch(() => null);
      if (r?.status === "ok") window.location.href = "/home";
      if (r?.status === "expired") setState("expired");
    }, 2000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [code]);

  const start = async () => {
    const r = await fetch("/api/login/start", { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (!r?.url) return setState("error");
    setCode(r.code);
    setUrl(r.url);
    setState("waiting");
    window.open(r.url, "_blank");
  };

  if (state === "waiting" && url)
    return (
      <div className="login-wait">
        <p>Waiting for you to press <b>Start</b> in Telegram… 🛵</p>
        <a className="btn ghost" href={url} target="_blank" rel="noreferrer">Open Telegram again</a>
      </div>
    );
  return (
    <div>
      {state === "expired" && <p className="warn">That one timed out.</p>}
      {state === "error" && <p className="warn">Couldn&apos;t reach the bot. Try again in a moment?</p>}
      <button className="btn" onClick={start}>Log in with Telegram</button>
    </div>
  );
}
