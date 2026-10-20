import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { users, type User } from "@/db/schema";
import { GameError } from "./errors";

// Roles, like the shuttle app: member (everyone), staff (sees the dashboard), admin (changes things, gets reports).
// The first admins come from BOOTSTRAP_ADMINS (Telegram usernames, comma-separated, @ optional); they make others.
export type Role = "member" | "staff" | "admin";
export const ROLES: Role[] = ["member", "staff", "admin"];

export const isAdmin = (u: Pick<User, "role"> | null | undefined) => u?.role === "admin";
export const isStaff = (u: Pick<User, "role"> | null | undefined) => u?.role === "staff" || u?.role === "admin";

export function requireAdmin(u: User | null | undefined) {
  if (!isAdmin(u)) throw new GameError("Only admins can do that.");
}

export const bootstrapAdmins = () =>
  (process.env.BOOTSTRAP_ADMINS ?? "").split(",").map((s) => s.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);

/** Promote a bootstrap admin the moment we see their username. Never demotes. */
export async function applyBootstrap(db: Db, u: User): Promise<User> {
  if (u.role === "admin" || !u.username || !bootstrapAdmins().includes(u.username.toLowerCase())) return u;
  const [up] = await db.update(users).set({ role: "admin" }).where(eq(users.id, u.id)).returning();
  return up;
}

/** Admin: give someone a role. You can't demote yourself (so there's always an admin). */
export async function setRole(db: Db, admin: User, userId: number, role: Role) {
  requireAdmin(admin);
  if (!ROLES.includes(role)) throw new GameError("Unknown role.");
  if (userId === admin.id && role !== "admin") throw new GameError("Ask another admin to change your own role.");
  const [u] = await db.update(users).set({ role }).where(eq(users.id, userId)).returning();
  if (!u) throw new GameError("No such person.");
  return u;
}

export async function admins(db: Db) {
  return db.select().from(users).where(eq(users.role, "admin"));
}
