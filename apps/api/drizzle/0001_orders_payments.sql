ALTER TABLE "order_lines" ADD COLUMN "snapshot" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" "payment_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "current_payment_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "item_count" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_data" jsonb;--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");