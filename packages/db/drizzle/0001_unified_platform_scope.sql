CREATE TABLE "manual_article" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"source_url" text,
	"source_published_on" date,
	"source_language" text,
	"credits" text DEFAULT '' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_article_source_url_ck" CHECK ("manual_article"."source_url" is null or "manual_article"."source_url" ~ '^https://'),
	CONSTRAINT "manual_article_source_language_ck" CHECK ("manual_article"."source_language" is null or "manual_article"."source_language" in ('cs', 'sk', 'en')),
	CONSTRAINT "manual_article_credits_ck" CHECK (length("manual_article"."credits") <= 500)
);
--> statement-breakpoint
CREATE TABLE "manual_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game" text NOT NULL,
	"key" text NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"label_cs" text NOT NULL,
	"label_en" text NOT NULL,
	"description_cs" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_category_game_ck" CHECK ("manual_category"."game" in ('wardogs', 'hell-let-loose')),
	CONSTRAINT "manual_category_key_ck" CHECK ("manual_category"."key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("manual_category"."key") <= 64),
	CONSTRAINT "manual_category_label_ck" CHECK (length(btrim("manual_category"."label_cs")) between 1 and 80 and length(btrim("manual_category"."label_en")) between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "content_document" DROP CONSTRAINT "content_document_kind_ck";--> statement-breakpoint
ALTER TABLE "content_document" DROP CONSTRAINT "content_document_page_key_ck";--> statement-breakpoint
ALTER TABLE "content_translation" DROP CONSTRAINT "content_translation_namespace_ck";--> statement-breakpoint
ALTER TABLE "local_admin_grant" ADD COLUMN "games" text[];--> statement-breakpoint
ALTER TABLE "manual_article" ADD CONSTRAINT "manual_article_document_id_content_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."content_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "manual_category_game_key_uq" ON "manual_category" USING btree ("game","key");--> statement-breakpoint
ALTER TABLE "local_admin_grant" ADD CONSTRAINT "local_admin_grant_games_ck" CHECK ("local_admin_grant"."games" is null or (cardinality("local_admin_grant"."games") > 0 and "local_admin_grant"."games" <@ array['wardogs', 'hell-let-loose']::text[]));--> statement-breakpoint
ALTER TABLE "content_document" ADD CONSTRAINT "content_document_manual_game_ck" CHECK ("content_document"."kind" <> 'manual' or "content_document"."game" is not null);--> statement-breakpoint
ALTER TABLE "content_document" ADD CONSTRAINT "content_document_kind_ck" CHECK ("content_document"."kind" in ('news', 'page', 'manual'));--> statement-breakpoint
ALTER TABLE "content_document" ADD CONSTRAINT "content_document_page_key_ck" CHECK (("content_document"."kind" = 'page' and "content_document"."page_key" in ('clan', 'community', 'privacy')) or ("content_document"."kind" in ('news', 'manual') and "content_document"."page_key" is null));--> statement-breakpoint
ALTER TABLE "content_translation" ADD CONSTRAINT "content_translation_namespace_ck" CHECK ("content_translation"."namespace" in ('news', 'page', 'manual'));