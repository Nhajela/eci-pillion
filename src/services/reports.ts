import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { reports, users, type User } from "@/db/schema";
import { esc, type Notifier } from "@/bot/telegram";
import { env } from "@/lib/env";
import { GameError } from "./errors";
import { admins, requireAdmin } from "./roles";

export type ReportKind = "bug" | "feature";
export const REPORT_STATUSES = ["new", "doing", "done", "wontdo"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
const PER_HOUR = 10;

/** File a bug or feature request and DM every admin straight away. */
export async function fileReport(
  db: Db, n: Notifier, user: User | null,
  input: { kind: ReportKind; text: string; source: "telegram" | "web"; page?: string | null }, now: Date,
) {
  const text = input.text.trim().slice(0, 2000);
  if (text.length < 3) throw new GameError("Tell us a little more: what happened, or what you wish it did?");
  if (user) {
    const [recent] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(reports)
      .where(and(eq(reports.userId, user.id), gt(reports.createdAt, new Date(now.getTime() - 3600_000))));
    if ((recent?.c ?? 0) >= PER_HOUR) throw new GameError("That's a lot of reports for one hour! Thank you. Give us a moment to catch up. 🙏");
  }
  const [r] = await db
    .insert(reports)
    .values({ userId: user?.id ?? null, kind: input.kind, text, source: input.source, page: input.page?.slice(0, 200) ?? null, createdAt: now })
    .returning();
  const who = user ? `${esc(user.name)}${user.username ? ` (@${esc(user.username)})` : ""}` : "someone not logged in";
  const head = input.kind === "bug" ? "🐞 <b>Bug</b>" : "💡 <b>Feature request</b>";
  for (const a of await admins(db)) {
    await n.dm({
      to: a.telegramId,
      text: `${head} #${r.id} from ${who} via ${input.source}${r.page ? ` on ${esc(r.page)}` : ""}:\n\n${esc(text)}`,
      buttons: [[{ text: "Open dashboard", url: `${env.origin()}/admin#reports` }]],
    });
  }
  return r;
}

/** Admin: move a report along. Telling the reporter when it's done is the nice part. */
export async function setReportStatus(db: Db, n: Notifier, admin: User, id: number, status: ReportStatus, now: Date) {
  requireAdmin(admin);
  if (!REPORT_STATUSES.includes(status)) throw new GameError("Unknown status.");
  const [r] = await db.update(reports).set({ status, updatedAt: now }).where(eq(reports.id, id)).returning();
  if (!r) throw new GameError("No such report.");
  if (r.userId && (status === "done" || status === "wontdo")) {
    const [u] = await db.select().from(users).where(eq(users.id, r.userId));
    const what = esc(r.text.length > 80 ? `${r.text.slice(0, 80)}…` : r.text);
    if (u)
      await n.dm({
        to: u.telegramId,
        text: status === "done"
          ? `🎉 Your ${r.kind === "bug" ? "bug report" : "idea"} is ${r.kind === "bug" ? "fixed" : "in"}: “${what}”. Thank you for helping build Pillion!`
          : `🙏 About your ${r.kind === "bug" ? "bug report" : "idea"} “${what}”: we're not doing this one for now. Thank you for telling us!`,
      });
  }
  return r;
}

export async function listReports(db: Db, limit = 100) {
  return db
    .select({ r: reports, u: users })
    .from(reports)
    .leftJoin(users, eq(reports.userId, users.id))
    .orderBy(sql`case ${reports.status} when 'new' then 0 when 'doing' then 1 else 2 end`, desc(reports.createdAt))
    .limit(limit);
}
