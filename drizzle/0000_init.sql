CREATE TABLE "floats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"live_until" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hearts" (
	"from_id" integer NOT NULL,
	"to_id" integer NOT NULL,
	"day" text NOT NULL,
	CONSTRAINT "hearts_from_id_to_id_day_pk" PRIMARY KEY("from_id","to_id","day")
);
--> statement-breakpoint
CREATE TABLE "kaju" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"day" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" integer,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"from_place" text NOT NULL,
	"to_place" text NOT NULL,
	"depart_at" timestamp with time zone NOT NULL,
	"lead_minutes" integer NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" serial PRIMARY KEY NOT NULL,
	"offer_id" integer,
	"request_id" integer,
	"pilot_id" integer NOT NULL,
	"hitcher_id" integer NOT NULL,
	"from_place" text NOT NULL,
	"to_place" text NOT NULL,
	"depart_at" timestamp with time zone NOT NULL,
	"via_float" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'matched' NOT NULL,
	"cancelled_by" integer,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sent_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" text,
	"name" text NOT NULL,
	"vehicle" text DEFAULT 'none' NOT NULL,
	"seats" integer DEFAULT 0 NOT NULL,
	"avatar" text,
	"scooty" text DEFAULT '#7fd1b9' NOT NULL,
	"bot_state" jsonb,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
ALTER TABLE "floats" ADD CONSTRAINT "floats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearts" ADD CONSTRAINT "hearts_from_id_users_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearts" ADD CONSTRAINT "hearts_to_id_users_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kaju" ADD CONSTRAINT "kaju_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_codes" ADD CONSTRAINT "login_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_offer_id_plans_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_request_id_plans_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_pilot_id_users_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_hitcher_id_users_id_fk" FOREIGN KEY ("hitcher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "floats_one_active" ON "floats" USING btree ("user_id") WHERE ended_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "kaju_once" ON "kaju" USING btree ("user_id","reason","ref");--> statement-breakpoint
CREATE INDEX "kaju_day" ON "kaju" USING btree ("day");--> statement-breakpoint
CREATE INDEX "plans_open" ON "plans" USING btree ("status","depart_at");--> statement-breakpoint
CREATE INDEX "rides_status" ON "rides" USING btree ("status","depart_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rides_one_per_request" ON "rides" USING btree ("request_id") WHERE status <> 'cancelled' and request_id is not null;