import { NextResponse } from "next/server";
import { db } from "@/db";
import { safeNext } from "@/lib/auth";
import { env } from "@/lib/env";
import { COOKIE, cookieOptions, makeSession } from "@/lib/session";
import { redeemLogin } from "@/services/login";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await redeemLogin(db(), url.searchParams.get("code") ?? "", new Date());
  if (typeof r !== "number") return NextResponse.redirect(`${env.origin()}/login?expired=1`);
  const res = NextResponse.redirect(`${env.origin()}${safeNext(url.searchParams.get("next"))}`);
  res.cookies.set(COOKIE, makeSession(r, env.sessionSecret()), cookieOptions);
  return res;
}
