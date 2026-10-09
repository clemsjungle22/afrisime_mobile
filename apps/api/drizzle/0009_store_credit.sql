CREATE TABLE "store_credit_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"carnet_id" text,
	"order_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carnets" ADD COLUMN "order_id" text;--> statement-breakpoint
ALTER TABLE "carnets" ADD COLUMN "credited_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "store_credit_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "store_credit_entries" ADD CONSTRAINT "store_credit_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_credit_customer_idx" ON "store_credit_entries" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_credit_order_reason_uidx" ON "store_credit_entries" USING btree ("order_id","reason");--> statement-breakpoint
CREATE UNIQUE INDEX "store_credit_carnet_reason_uidx" ON "store_credit_entries" USING btree ("carnet_id","reason");