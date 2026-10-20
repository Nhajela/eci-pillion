CREATE TABLE "places" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"kind" text DEFAULT 'spot' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"note" text,
	"added_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"page" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_status" ON "reports" USING btree ("status","created_at");