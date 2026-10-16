"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { loadAvatar } from "./avatar-store";
import { act } from "./act";

/** First login: bring the avatar drawn before logging in into the account. */
export function AvatarSync({ hasAvatar }: { hasAvatar: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (hasAvatar) return;
    const a = loadAvatar();
    if (!a) return;
    act({ action: "me", avatar: a.drawing, scooty: a.scooty, ...(a.name ? { name: a.name } : {}) }).then(() => router.refresh(), () => {});
  }, [hasAvatar, router]);
  return null;
}
