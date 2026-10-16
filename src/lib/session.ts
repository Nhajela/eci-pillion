import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Signed cookie: base64url({uid, exp}).hmac. No session table needed.
export const COOKIE = "pillion_session";
const DAYS = 30;

const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function makeSession(userId: number, secret: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ uid: userId, exp: now + DAYS * 86400_000 })).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function readSession(value: string | undefined, secret: string, now = Date.now()): number | null {
  if (!value || !secret) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body, secret));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof uid === "number" && exp > now ? uid : null;
  } catch {
    return null;
  }
}

export const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: true, path: "/", maxAge: DAYS * 86400 };

// Telegram start params allow [A-Za-z0-9_-], up to 64 chars.
export const newCode = () => randomBytes(18).toString("base64url");
