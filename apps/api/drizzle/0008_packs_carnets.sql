CREATE TABLE "carnet_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"carnet_id" text NOT NULL,
	"method" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text NOT NULL,
	"provider" text,
	"provider_reference" text,
	"provider_data" jsonb,
	"phone" text,
	"agency_id" text,
	"recorded_by" text,
	"note" text,
	"failure_reason" text,
	"expires_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carnets" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"pack_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"price" integer NOT NULL,
	"duration_days" integer NOT NULL,
	"daily_amount" integer NOT NULL,
	"paid" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"items" jsonb NOT NULL,
	"price" integer NOT NULL,
	"duration_days" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carnet_contributions" ADD CONSTRAINT "carnet_contributions_carnet_id_carnets_id_fk" FOREIGN KEY ("carnet_id") REFERENCES "public"."carnets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carnet_contributions" ADD CONSTRAINT "carnet_contributions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carnet_contributions" ADD CONSTRAINT "carnet_contributions_recorded_by_admin_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carnets" ADD CONSTRAINT "carnets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carnets" ADD CONSTRAINT "carnets_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carnet_contributions_carnet_idx" ON "carnet_contributions" USING btree ("carnet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carnet_contributions_provider_ref_uidx" ON "carnet_contributions" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "carnets_customer_idx" ON "carnets" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "carnets_status_idx" ON "carnets" USING btree ("status");