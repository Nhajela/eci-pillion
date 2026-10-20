import { sql } from "drizzle-orm";
import {
  bigint, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  name: text("name").notNull(),
  vehicle: text("vehicle").notNull().default("none"), // scooty | bike | car | none
  role: text("role").notNull().default("member"), // member | staff (sees the dashboard) | admin (changes things)
  inviteCode: text("invite_code").unique(), // personal link t.me/<bot>?start=inv_<code>, made on first use
  invitedBy: integer("invited_by"), // who brought them (their link, or an @username invite); set once, before sign-up
  seats: integer("seats").notNull().default(0),
  avatar: text("avatar"), // data:image/png;base64,… (128 px)
  scooty: text("scooty").notNull().default("#7fd1b9"),
  botState: jsonb("bot_state").$type<Record<string, unknown> | null>(),
  onboardedAt: ts("onboarded_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const loginCodes = pgTable("login_codes", {
  code: text("code").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  claimedAt: ts("claimed_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const plans = pgTable(
  "plans",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(), // offer | request
    fromPlace: text("from_place").notNull(),
    toPlace: text("to_place").notNull(),
    departAt: ts("depart_at").notNull(),
    leadMinutes: integer("lead_minutes").notNull(),
    seats: integer("seats").notNull().default(1), // offers: seats still free
    status: text("status").notNull().default("open"), // open | full | done | cancelled
    note: text("note"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("plans_open").on(t.status, t.departAt)],
);

export const rides = pgTable(
  "rides",
  {
    id: serial("id").primaryKey(),
    offerId: integer("offer_id").references(() => plans.id),
    requestId: integer("request_id").references(() => plans.id),
    pilotId: integer("pilot_id").notNull().references(() => users.id),
    hitcherId: integer("hitcher_id").notNull().references(() => users.id),
    fromPlace: text("from_place").notNull(),
    toPlace: text("to_place").notNull(),
    departAt: ts("depart_at").notNull(),
    viaFloat: boolean("via_float").notNull().default(false),
    status: text("status").notNull().default("matched"), // matched | done | cancelled | expired
    deniedBy: integer("denied_by").references(() => users.id), // said "didn't happen"; the other can still say yes
    cancelledBy: integer("cancelled_by").references(() => users.id),
    completedAt: ts("completed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("rides_status").on(t.status, t.departAt),
    // one live ride per request
    uniqueIndex("rides_one_per_request").on(t.requestId).where(sql`status <> 'cancelled' and request_id is not null`),
  ],
);

export const floats = pgTable(
  "floats",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    startedAt: ts("started_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    liveUntil: ts("live_until").notNull(),
    endedAt: ts("ended_at"),
    forfeitMinutes: integer("forfeit_minutes").notNull().default(0), // unpaid minutes (the floater refused a request)
    checkedAt: ts("checked_at"), // "still floating?" asked at; cleared by a location update or "still here"
  },
  (t) => [uniqueIndex("floats_one_active").on(t.userId).where(sql`ended_at is null`)],
);

export const kaju = pgTable(
  "kaju",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    ref: text("ref").notNull().default(""),
    day: text("day").notNull(), // IST YYYY-MM-DD
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("kaju_once").on(t.userId, t.reason, t.ref), index("kaju_day").on(t.day)],
);

export const hearts = pgTable(
  "hearts",
  {
    fromId: integer("from_id").notNull().references(() => users.id),
    toId: integer("to_id").notNull().references(() => users.id),
    day: text("day").notNull(),
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId, t.day] })],
);

/** A floater was asked to pick someone up. Floaters must answer: refusing (or letting it lapse) ends the float. */
export const floatPings = pgTable(
  "float_pings",
  {
    id: serial("id").primaryKey(),
    floatId: integer("float_id").notNull().references(() => floats.id),
    userId: integer("user_id").notNull().references(() => users.id),
    requestId: integer("request_id").notNull().references(() => plans.id),
    pingedAt: ts("pinged_at").notNull(),
    outcome: text("outcome").notNull().default("pending"), // pending | took | refused | missed | released
    resolvedAt: ts("resolved_at"),
  },
  (t) => [uniqueIndex("float_pings_once").on(t.floatId, t.requestId), index("float_pings_pending").on(t.outcome, t.pingedAt)],
);

/** Invites by Telegram @username, like the assassins game: one per username, ever; the first inviter gets the credit
 *  when that account signs up, even without the link. */
export const invites = pgTable("invites", {
  username: text("username").primaryKey(), // lowercase, no @
  inviterId: integer("inviter_id").notNull().references(() => users.id),
  claimedBy: integer("claimed_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  claimedAt: ts("claimed_at"),
});

/** Places people go. Seeded from src/lib/places.ts; anyone can add one by naming it (and dropping a pin),
 *  admins rename, hide or pin it as a hub. A place without coordinates matches by name only. */
export const places = pgTable("places", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  kind: text("kind").notNull().default("spot"), // hub | spot | stay | event
  hidden: boolean("hidden").notNull().default(false),
  note: text("note"),
  mergedInto: text("merged_into"), // an admin merged this duplicate into another place; its name still finds that one
  addedBy: integer("added_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Bugs and feature requests (beta). Admins get a Telegram DM for each one. */
export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    kind: text("kind").notNull(), // bug | feature
    text: text("text").notNull(),
    source: text("source").notNull(), // telegram | web
    page: text("page"),
    status: text("status").notNull().default("new"), // new | doing | done | wontdo
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("reports_status").on(t.status, t.createdAt)],
);

/** Scheduled messages already sent (idempotency for the ticker). */
export const sentKeys = pgTable("sent_keys", {
  key: text("key").primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Ride = typeof rides.$inferSelect;
export type Float = typeof floats.$inferSelect;
export type PlaceRow = typeof places.$inferSelect;
export type Report = typeof reports.$inferSelect;
