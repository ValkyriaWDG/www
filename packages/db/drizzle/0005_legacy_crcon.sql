CREATE TABLE "legacy_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_origin" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_key" text NOT NULL,
	"locale" text DEFAULT 'cs' NOT NULL,
	"source_url" text NOT NULL,
	"source_sha256" text NOT NULL,
	"source_published_on" date,
	"source_language" text DEFAULT 'cs' NOT NULL,
	"credits" text DEFAULT '' NOT NULL,
	"translation_id" uuid,
	"match_id" uuid,
	"tournament_id" uuid,
	"asset_id" uuid,
	"imported_version" integer DEFAULT 1 NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_import_target_ck" CHECK (num_nonnulls("legacy_import"."translation_id", "legacy_import"."match_id", "legacy_import"."tournament_id", "legacy_import"."asset_id") = 1),
	CONSTRAINT "legacy_import_kind_ck" CHECK ("legacy_import"."source_kind" in ('news', 'manual', 'page', 'match', 'tournament', 'media')),
	CONSTRAINT "legacy_import_locale_ck" CHECK ("legacy_import"."locale" in ('cs', 'en')),
	CONSTRAINT "legacy_import_hash_ck" CHECK ("legacy_import"."source_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "legacy_import_language_ck" CHECK ("legacy_import"."source_language" in ('cs', 'sk', 'en'))
);
--> statement-breakpoint
ALTER TABLE "match_statistics" ADD COLUMN "source_server_public_id" text;--> statement-breakpoint
ALTER TABLE "match_statistics" ADD COLUMN "source_game_url" text;--> statement-breakpoint
ALTER TABLE "legacy_import" ADD CONSTRAINT "legacy_import_translation_id_content_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."content_translation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_import" ADD CONSTRAINT "legacy_import_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_import" ADD CONSTRAINT "legacy_import_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_import" ADD CONSTRAINT "legacy_import_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_import_identity_uq" ON "legacy_import" USING btree ("source_origin","source_kind","source_key","locale");