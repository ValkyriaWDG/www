CREATE TABLE "tournament" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"game" text NOT NULL,
	"name" text NOT NULL,
	"season" text,
	"organizer" text,
	"starts_on" date,
	"ends_on" date,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"publication" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"internal_notes" text DEFAULT '' NOT NULL,
	"is_fixture" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tournament_game_ck" CHECK ("tournament"."game" in ('wardogs', 'hell-let-loose')),
	CONSTRAINT "tournament_publication_ck" CHECK ("tournament"."publication" in ('draft', 'published')),
	CONSTRAINT "tournament_published_at_ck" CHECK ("tournament"."publication" <> 'published' or "tournament"."published_at" is not null),
	CONSTRAINT "tournament_slug_ck" CHECK ("tournament"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("tournament"."slug") <= 120),
	CONSTRAINT "tournament_name_ck" CHECK (length(btrim("tournament"."name")) between 1 and 160),
	CONSTRAINT "tournament_dates_ck" CHECK ("tournament"."starts_on" is null or "tournament"."ends_on" is null or "tournament"."ends_on" >= "tournament"."starts_on"),
	CONSTRAINT "tournament_links_ck" CHECK (jsonb_typeof("tournament"."links") = 'array' and jsonb_array_length("tournament"."links") <= 10)
);
--> statement-breakpoint
ALTER TABLE "prose_translation" DROP CONSTRAINT "prose_translation_owner_ck";--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "tournament_id" uuid;--> statement-breakpoint
ALTER TABLE "prose_translation" ADD COLUMN "tournament_id" uuid;--> statement-breakpoint
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tournament_public_idx" ON "tournament" USING btree ("game","publication","starts_on");--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prose_translation" ADD CONSTRAINT "prose_translation_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_tournament_idx" ON "match" USING btree ("tournament_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prose_translation_tournament_locale_uq" ON "prose_translation" USING btree ("tournament_id","locale") WHERE "prose_translation"."tournament_id" is not null;--> statement-breakpoint
ALTER TABLE "prose_translation" ADD CONSTRAINT "prose_translation_owner_ck" CHECK (num_nonnulls("prose_translation"."member_profile_id", "prose_translation"."match_id", "prose_translation"."tournament_id") = 1);