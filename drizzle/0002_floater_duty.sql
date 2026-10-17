CREATE TABLE "float_pings" (
	"id" serial PRIMARY KEY NOT NULL,
	"float_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"request_id" integer NOT NULL,
	"pinged_at" timestamp with time zone NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "floats" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "denied_by" integer;--> statement-breakpoint
ALTER TABLE "float_pings" ADD CONSTRAINT "float_pings_float_id_floats_id_fk" FOREIGN KEY ("float_id") REFERENCES "public"."floats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_pings" ADD CONSTRAINT "float_pings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_pings" ADD CONSTRAINT "float_pings_request_id_plans_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "float_pings_once" ON "float_pings" USING btree ("float_id","request_id");--> statement-breakpoint
CREATE INDEX "float_pings_pending" ON "float_pings" USING btree ("outcome","pinged_at");--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_denied_by_users_id_fk" FOREIGN KEY ("denied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;