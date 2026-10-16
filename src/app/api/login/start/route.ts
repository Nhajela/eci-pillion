import { db } from "@/db";
import { botEnabled, env } from "@/lib/env";
import { startLogin } from "@/services/login";

export async function POST() {
  if (!botEnabled()) return Response.json({ error: "The bot isn't awake yet." }, { status: 503 });
  const code = await startLogin(db(), new Date());
  return Response.json({ code, url: `https://t.me/${env.botUsername()}?start=login_${code}` });
}
