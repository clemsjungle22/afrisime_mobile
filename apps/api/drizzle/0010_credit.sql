ALTER TYPE "public"."payment_method" ADD VALUE 'credit';--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"customer_id" text PRIMARY KEY NOT NULL,
	"limit" integer NOT NULL,
	"term_days" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"suspended_reason" text,
	"granted_by" text,
	"granted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_debts" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"order_id" text NOT NULL,
	"amount" integer NOT NULL,
	"paid" integer DEFAULT 0 NOT NULL,
	"term_days" integer NOT NULL,
	"daily_amount" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_debts_orderId_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "credit_repayments" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
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
	"allocations" jsonb,
	"expires_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"amount" integer NOT NULL,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_granted_by_admin_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_debts" ADD CONSTRAINT "credit_debts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_debts" ADD CONSTRAINT "credit_debts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD CONSTRAINT "credit_repayments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD CONSTRAINT "credit_repayments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD CONSTRAINT "credit_repayments_recorded_by_admin_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_reviewed_by_admin_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_debts_customer_idx" ON "credit_debts" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "credit_repayments_customer_idx" ON "credit_repayments" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_repayments_provider_ref_uidx" ON "credit_repayments" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "credit_requests_customer_idx" ON "credit_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "credit_requests_status_idx" ON "credit_requests" USING btree ("status");