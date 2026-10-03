ALTER TABLE "taxonomy_term" ADD COLUMN "sort_order" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "taxonomy_term" ADD COLUMN "description_cs" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "taxonomy_term" ADD COLUMN "description_en" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "taxonomy_term" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "manual_category" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "taxonomy_term" ADD CONSTRAINT "taxonomy_term_description_ck" CHECK (length("taxonomy_term"."description_cs") <= 300 and length("taxonomy_term"."description_en") <= 300);--> statement-breakpoint
ALTER TABLE "manual_category" ADD CONSTRAINT "manual_category_description_ck" CHECK (length("manual_category"."description_cs") <= 300 and length("manual_category"."description_en") <= 300);