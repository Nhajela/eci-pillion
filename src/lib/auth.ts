import { cookies } from "next/headers";
import { db, hasDb } from "@/db";
import { getUser } from "@/services/users";
import { env } from "./env";
import { COOKIE, readSession } from "./session";

export async function currentUser() {
  if (!hasDb()) return null;
  const jar = await cookies();
  const uid = readSession(jar.get(COOKIE)?.value, env.sessionSecret());
  return uid ? getUser(db(), uid) : null;
}

/** Reject cross-site POSTs (the cookie is SameSite=Lax, this is belt and braces). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");
