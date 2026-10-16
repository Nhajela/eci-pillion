"use client";

import { useEffect, useState } from "react";

// The avatar lives in this browser until Telegram login ships; then it moves to the account.
export type Avatar = { name: string; drawing: string; scooty: string; savedAt: number };

const KEY = "pillion.avatar.v1";
const EVENT = "pillion:avatar";

export function loadAvatar(): Avatar | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Avatar) : null;
  } catch {
    return null;
  }
}

export function saveAvatar(a: Avatar) {
  localStorage.setItem(KEY, JSON.stringify(a));
  window.dispatchEvent(new Event(EVENT));
}

export function useAvatar() {
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  useEffect(() => {
    const sync = () => setAvatar(loadAvatar());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return avatar;
}

export const SCOOTY_COLOURS = ["#7fd1b9", "#ff7eb6", "#ffd23f", "#ff6b35", "#5b8def", "#b28dff"];
