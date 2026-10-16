import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { handleUpdate, type Update } from "@/bot/handle";
import { botEnabled, env } from "@/lib/env";
import { getCall, getNotifier } from "@/lib/runtime";

export async function POST(req: Request) {
  if (!botEnabled()) return new Response("bot off", { status: 503 });
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(env.webhookSecret());
  if (!want.length || got.length !== want.length || !timingSafeEqual(got, want)) return new Response("nope", { status: 401 });
  const update = (await req.json()) as Update;
  try {
    await handleUpdate({ db: db(), call: getCall(), n: getNotifier(), now: new Date() }, update);
  } catch (e) {
    // answer 200 anyway so Telegram doesn't retry the same update forever
    console.error("update failed", e);
  }
  return new Response("ok");
}
