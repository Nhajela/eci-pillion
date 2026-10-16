import { NextResponse } from "next/server";
import { db } from "@/db";
import { env } from "@/lib/env";
import { COOKIE, cookieOptions, makeSession } from "@/lib/session";
import { redeemLogin } from "@/services/login";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const r = await redeemLogin(db(), code, new Date());
  if (typeof r !== "number") return NextResponse.json({ status: r });
  const res = NextResponse.json({ status: "ok" });
  res.cookies.set(COOKIE, makeSession(r, env.sessionSecret()), cookieOptions);
  return res;
}
