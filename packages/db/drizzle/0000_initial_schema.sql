CREATE TABLE "auth_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"assurance" text DEFAULT 'unknown' NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_two_factor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"discord_user_id" text NOT NULL,
	"user_id" uuid,
	"state" text NOT NULL,
	"role_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"sequence" bigint DEFAULT 0 NOT NULL,
	"last_refresh_attempt_at" timestamp with time zone,
	"last_refresh_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_membership_state_ck" CHECK ("guild_membership"."state" in ('present', 'left', 'unknown')),
	CONSTRAINT "guild_membership_source_ck" CHECK ("guild_membership"."source" in ('oauth_login', 'rest_refresh', 'role_sync')),
	CONSTRAINT "guild_membership_guild_snowflake_ck" CHECK ("guild_membership"."guild_id" ~ '^[0-9]{5,25}$'),
	CONSTRAINT "guild_membership_user_snowflake_ck" CHECK ("guild_membership"."discord_user_id" ~ '^[0-9]{5,25}$')
);
--> statement-breakpoint
CREATE TABLE "local_admin_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"roles" text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"provisioned_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_admin_grant_roles_ck" CHECK (cardinality("local_admin_grant"."roles") > 0 and "local_admin_grant"."roles" <@ array['editor', 'match_manager', 'administrator', 'owner']::text[])
);
--> statement-breakpoint
CREATE TABLE "role_mapping_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"digest" text NOT NULL,
	"guild_id" text,
	"mapping" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_mapping_version_version_unique" UNIQUE("version"),
	CONSTRAINT "role_mapping_version_digest_unique" UNIQUE("digest")
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_kind" text NOT NULL,
	"actor_label" text NOT NULL,
	"capability" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"translation_id" uuid,
	"locale" text,
	"outcome" text NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	CONSTRAINT "audit_event_outcome_ck" CHECK ("audit_event"."outcome" in ('success', 'denied', 'failure')),
	CONSTRAINT "audit_event_actor_kind_ck" CHECK ("audit_event"."actor_kind" in ('discord', 'local_admin', 'system', 'scheduler', 'operator', 'anonymous')),
	CONSTRAINT "audit_event_locale_ck" CHECK ("audit_event"."locale" is null or "audit_event"."locale" in ('cs', 'en'))
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"state" text DEFAULT 'processing' NOT NULL,
	"owner_user_id" uuid,
	"original_filename" text NOT NULL,
	"source_format" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"variants" jsonb,
	"provenance" text DEFAULT '' NOT NULL,
	"rights" text DEFAULT '' NOT NULL,
	"default_alt_cs" text DEFAULT '' NOT NULL,
	"default_alt_en" text DEFAULT '' NOT NULL,
	"default_caption_cs" text DEFAULT '' NOT NULL,
	"default_caption_en" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_scope_ck" CHECK ("asset"."scope" in ('editorial', 'match')),
	CONSTRAINT "asset_state_ck" CHECK ("asset"."state" in ('processing', 'ready', 'failed')),
	CONSTRAINT "asset_source_format_ck" CHECK ("asset"."source_format" in ('jpeg', 'png', 'webp')),
	CONSTRAINT "asset_dimensions_ck" CHECK ("asset"."width" > 0 and "asset"."height" > 0 and "asset"."bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "content_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"page_key" text,
	"game" text,
	"category_key" text,
	"tag_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_fixture" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_document_kind_ck" CHECK ("content_document"."kind" in ('news', 'page')),
	CONSTRAINT "content_document_page_key_ck" CHECK (("content_document"."kind" = 'page' and "content_document"."page_key" in ('clan', 'community', 'privacy')) or ("content_document"."kind" = 'news' and "content_document"."page_key" is null)),
	CONSTRAINT "content_document_game_ck" CHECK ("content_document"."game" is null or "content_document"."game" in ('wardogs', 'hell-let-loose'))
);
--> statement-breakpoint
CREATE TABLE "content_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"kind" text NOT NULL,
	"restored_from_revision_id" uuid,
	"schema_version" integer NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" jsonb NOT NULL,
	"cover" jsonb,
	"taxonomy" jsonb NOT NULL,
	"author_label" text DEFAULT '' NOT NULL,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"asset_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_by" uuid,
	"created_by_label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revision_id_translation_uq" UNIQUE("id","translation_id"),
	CONSTRAINT "content_revision_locale_ck" CHECK ("content_revision"."locale" in ('cs', 'en')),
	CONSTRAINT "content_revision_kind_ck" CHECK ("content_revision"."kind" in ('autosave', 'save', 'restore', 'seed'))
);
--> statement-breakpoint
CREATE TABLE "content_translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"namespace" text NOT NULL,
	"draft_slug" text NOT NULL,
	"live_slug" text,
	"draft_revision_id" uuid,
	"published_revision_id" uuid,
	"first_published_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_translation_id_locale_uq" UNIQUE("id","locale"),
	CONSTRAINT "content_translation_locale_ck" CHECK ("content_translation"."locale" in ('cs', 'en')),
	CONSTRAINT "content_translation_namespace_ck" CHECK ("content_translation"."namespace" in ('news', 'page')),
	CONSTRAINT "content_translation_slug_ck" CHECK ("content_translation"."draft_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("content_translation"."draft_slug") <= 120),
	CONSTRAINT "content_translation_live_state_ck" CHECK (("content_translation"."published_revision_id" is null and "content_translation"."live_slug" is null) or ("content_translation"."published_revision_id" is not null and "content_translation"."live_slug" is not null and "content_translation"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "publication_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"revision_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"time_zone" text DEFAULT 'Europe/Prague' NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"issuer_user_id" uuid,
	"issuer_kind" text NOT NULL,
	"issuer_label" text NOT NULL,
	"issuer_grant_id" uuid,
	"issuer_grant_version" integer,
	"issuer_assurance" text NOT NULL,
	"capability" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claim_expires_at" timestamp with time zone,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"previous_schedule_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_schedule_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "publication_schedule_state_ck" CHECK ("publication_schedule"."state" in ('pending', 'claimed', 'blocked', 'completed', 'cancelled', 'failed')),
	CONSTRAINT "publication_schedule_locale_ck" CHECK ("publication_schedule"."locale" in ('cs', 'en')),
	CONSTRAINT "publication_schedule_issuer_kind_ck" CHECK ("publication_schedule"."issuer_kind" in ('discord', 'local_admin')),
	CONSTRAINT "publication_schedule_delegation_ck" CHECK ("publication_schedule"."issuer_kind" <> 'local_admin' or ("publication_schedule"."issuer_grant_id" is not null and "publication_schedule"."issuer_grant_version" is not null))
);
--> statement-breakpoint
CREATE TABLE "slug_redirect" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace" text NOT NULL,
	"locale" text NOT NULL,
	"source_slug" text NOT NULL,
	"translation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slug_redirect_locale_ck" CHECK ("slug_redirect"."locale" in ('cs', 'en'))
);
--> statement-breakpoint
CREATE TABLE "taxonomy_term" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"label_cs" text NOT NULL,
	"label_en" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxonomy_term_kind_ck" CHECK ("taxonomy_term"."kind" in ('category', 'tag')),
	CONSTRAINT "taxonomy_term_key_ck" CHECK ("taxonomy_term"."key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"game" text NOT NULL,
	"opponent_name" text NOT NULL,
	"opponent_short_code" text,
	"opponent_logo_asset_id" uuid,
	"competition_type" text NOT NULL,
	"competition_name" text,
	"season" text,
	"format" text,
	"best_of" integer,
	"team_size" integer,
	"starts_at" timestamp with time zone NOT NULL,
	"time_zone" text DEFAULT 'Europe/Prague' NOT NULL,
	"original_starts_at" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"publication" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"event_url" text,
	"vod_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cover_asset_id" uuid,
	"internal_notes" text DEFAULT '' NOT NULL,
	"is_fixture" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_slug_unique" UNIQUE("slug"),
	CONSTRAINT "match_game_ck" CHECK ("match"."game" in ('wardogs', 'hell-let-loose')),
	CONSTRAINT "match_status_ck" CHECK ("match"."status" in ('scheduled', 'live', 'completed', 'postponed', 'cancelled')),
	CONSTRAINT "match_publication_ck" CHECK ("match"."publication" in ('draft', 'published')),
	CONSTRAINT "match_published_at_ck" CHECK ("match"."publication" <> 'published' or "match"."published_at" is not null),
	CONSTRAINT "match_competition_ck" CHECK ("match"."competition_type" in ('league', 'tournament', 'cup', 'friendly', 'scrim', 'other')),
	CONSTRAINT "match_slug_ck" CHECK ("match"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("match"."slug") <= 120),
	CONSTRAINT "match_opponent_ck" CHECK (length(btrim("match"."opponent_name")) between 1 and 120),
	CONSTRAINT "match_best_of_ck" CHECK ("match"."best_of" is null or "match"."best_of" between 1 and 99),
	CONSTRAINT "match_team_size_ck" CHECK ("match"."team_size" is null or "match"."team_size" between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "match_result" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"score_valkyria" integer,
	"score_opponent" integer,
	"outcome" text DEFAULT 'unknown' NOT NULL,
	"verification" text DEFAULT 'provisional' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_result_outcome_ck" CHECK ("match_result"."outcome" in ('win', 'loss', 'draw', 'unknown')),
	CONSTRAINT "match_result_verification_ck" CHECK ("match_result"."verification" in ('provisional', 'verified')),
	CONSTRAINT "match_result_scores_ck" CHECK (("match_result"."score_valkyria" is null and "match_result"."score_opponent" is null) or ("match_result"."score_valkyria" is not null and "match_result"."score_opponent" is not null and "match_result"."score_valkyria" >= 0 and "match_result"."score_opponent" >= 0))
);
--> statement-breakpoint
CREATE TABLE "match_round" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"map_name" text,
	"mode" text,
	"side" text,
	"score_valkyria" integer,
	"score_opponent" integer,
	"outcome" text,
	CONSTRAINT "match_round_ordinal_ck" CHECK ("match_round"."ordinal" between 1 and 50),
	CONSTRAINT "match_round_outcome_ck" CHECK ("match_round"."outcome" is null or "match_round"."outcome" in ('win', 'loss', 'draw', 'unknown')),
	CONSTRAINT "match_round_scores_ck" CHECK (("match_round"."score_valkyria" is null or "match_round"."score_valkyria" >= 0) and ("match_round"."score_opponent" is null or "match_round"."score_opponent" >= 0))
);
--> statement-breakpoint
CREATE TABLE "member_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"user_id" uuid,
	"avatar_asset_id" uuid,
	"games" text[] DEFAULT '{}'::text[] NOT NULL,
	"public_role_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"consent_confirmed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"is_fixture" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_profile_slug_unique" UNIQUE("slug"),
	CONSTRAINT "member_profile_state_ck" CHECK ("member_profile"."state" in ('draft', 'published', 'hidden')),
	CONSTRAINT "member_profile_slug_ck" CHECK ("member_profile"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("member_profile"."slug") <= 80),
	CONSTRAINT "member_profile_name_ck" CHECK (length(btrim("member_profile"."display_name")) between 1 and 80),
	CONSTRAINT "member_profile_games_ck" CHECK ("member_profile"."games" <@ array['wardogs', 'hell-let-loose']::text[]),
	CONSTRAINT "member_profile_roles_ck" CHECK ("member_profile"."public_role_keys" <@ array['leader', 'officer', 'member', 'recruit', 'veteran', 'content-creator']::text[]),
	CONSTRAINT "member_profile_consent_ck" CHECK ("member_profile"."state" <> 'published' or ("member_profile"."consent_confirmed_at" is not null and "member_profile"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "prose_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prose_translation_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"kind" text NOT NULL,
	"schema_version" integer NOT NULL,
	"body" jsonb NOT NULL,
	"cover" jsonb,
	"asset_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_by" uuid,
	"created_by_label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prose_revision_id_translation_uq" UNIQUE("id","prose_translation_id"),
	CONSTRAINT "prose_revision_locale_ck" CHECK ("prose_revision"."locale" in ('cs', 'en'))
);
--> statement-breakpoint
CREATE TABLE "prose_translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_profile_id" uuid,
	"match_id" uuid,
	"locale" text NOT NULL,
	"draft_revision_id" uuid,
	"published_revision_id" uuid,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prose_translation_id_locale_uq" UNIQUE("id","locale"),
	CONSTRAINT "prose_translation_locale_ck" CHECK ("prose_translation"."locale" in ('cs', 'en')),
	CONSTRAINT "prose_translation_owner_ck" CHECK (num_nonnulls("prose_translation"."member_profile_id", "prose_translation"."match_id") = 1),
	CONSTRAINT "prose_translation_live_ck" CHECK (("prose_translation"."published_revision_id" is null) = ("prose_translation"."published_at" is null))
);
--> statement-breakpoint
CREATE TABLE "site_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_two_factor" ADD CONSTRAINT "auth_two_factor_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_membership" ADD CONSTRAINT "guild_membership_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_admin_grant" ADD CONSTRAINT "local_admin_grant_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_user_id_auth_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_owner_user_id_auth_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_document" ADD CONSTRAINT "content_document_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_translation_locale_fk" FOREIGN KEY ("translation_id","locale") REFERENCES "public"."content_translation"("id","locale") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_translation" ADD CONSTRAINT "content_translation_document_id_content_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."content_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_translation" ADD CONSTRAINT "content_translation_draft_revision_fk" FOREIGN KEY ("draft_revision_id","id") REFERENCES "public"."content_revision"("id","translation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_translation" ADD CONSTRAINT "content_translation_published_revision_fk" FOREIGN KEY ("published_revision_id","id") REFERENCES "public"."content_revision"("id","translation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_schedule" ADD CONSTRAINT "publication_schedule_issuer_user_id_auth_user_id_fk" FOREIGN KEY ("issuer_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_schedule" ADD CONSTRAINT "publication_schedule_cancelled_by_auth_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_schedule" ADD CONSTRAINT "publication_schedule_translation_locale_fk" FOREIGN KEY ("translation_id","locale") REFERENCES "public"."content_translation"("id","locale") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_schedule" ADD CONSTRAINT "publication_schedule_revision_fk" FOREIGN KEY ("revision_id","translation_id") REFERENCES "public"."content_revision"("id","translation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slug_redirect" ADD CONSTRAINT "slug_redirect_translation_id_content_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."content_translation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_opponent_logo_asset_id_asset_id_fk" FOREIGN KEY ("opponent_logo_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_cover_asset_id_asset_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_result" ADD CONSTRAINT "match_result_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_result" ADD CONSTRAINT "match_result_recorded_by_auth_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_round" ADD CONSTRAINT "match_round_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profile" ADD CONSTRAINT "member_profile_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profile" ADD CONSTRAINT "member_profile_avatar_asset_id_asset_id_fk" FOREIGN KEY ("avatar_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prose_revision" ADD CONSTRAINT "prose_revision_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prose_revision" ADD CONSTRAINT "prose_revision_translation_locale_fk" FOREIGN KEY ("prose_translation_id","locale") REFERENCES "public"."prose_translation"("id","locale") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prose_translation" ADD CONSTRAINT "prose_translation_member_profile_id_member_profile_id_fk" FOREIGN KEY ("member_profile_id") REFERENCES "public"."member_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prose_translation" ADD CONSTRAINT "prose_translation_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prose_translation" ADD CONSTRAINT "prose_translation_draft_revision_fk" FOREIGN KEY ("draft_revision_id","id") REFERENCES "public"."prose_revision"("id","prose_translation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prose_translation" ADD CONSTRAINT "prose_translation_published_revision_fk" FOREIGN KEY ("published_revision_id","id") REFERENCES "public"."prose_revision"("id","prose_translation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_setting" ADD CONSTRAINT "site_setting_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_user_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_account_provider_subject_uq" ON "auth_account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "auth_session_user_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_two_factor_user_idx" ON "auth_two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_two_factor_secret_idx" ON "auth_two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_membership_guild_user_uq" ON "guild_membership" USING btree ("guild_id","discord_user_id");--> statement-breakpoint
CREATE INDEX "guild_membership_user_idx" ON "guild_membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_admin_grant_user_uq" ON "local_admin_grant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_event_occurred_idx" ON "audit_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_entity_idx" ON "audit_event" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_event_action_idx" ON "audit_event" USING btree ("action");--> statement-breakpoint
CREATE INDEX "asset_scope_idx" ON "asset" USING btree ("scope","created_at");--> statement-breakpoint
CREATE INDEX "asset_sha_idx" ON "asset" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "content_document_page_key_uq" ON "content_document" USING btree ("page_key") WHERE "content_document"."page_key" is not null;--> statement-breakpoint
CREATE INDEX "content_revision_translation_idx" ON "content_revision" USING btree ("translation_id","created_at");--> statement-breakpoint
CREATE INDEX "content_revision_assets_idx" ON "content_revision" USING gin ("asset_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "content_translation_document_locale_uq" ON "content_translation" USING btree ("document_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "content_translation_draft_slug_uq" ON "content_translation" USING btree ("namespace","locale","draft_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "content_translation_live_slug_uq" ON "content_translation" USING btree ("namespace","locale","live_slug") WHERE "content_translation"."live_slug" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "publication_schedule_active_uq" ON "publication_schedule" USING btree ("translation_id") WHERE "publication_schedule"."state" in ('pending', 'claimed', 'blocked', 'failed');--> statement-breakpoint
CREATE INDEX "publication_schedule_due_idx" ON "publication_schedule" USING btree ("state","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "slug_redirect_source_uq" ON "slug_redirect" USING btree ("namespace","locale","source_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_term_kind_key_uq" ON "taxonomy_term" USING btree ("kind","key");--> statement-breakpoint
CREATE INDEX "match_public_idx" ON "match" USING btree ("publication","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_round_order_uq" ON "match_round" USING btree ("match_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "member_profile_user_uq" ON "member_profile" USING btree ("user_id") WHERE "member_profile"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "member_profile_state_idx" ON "member_profile" USING btree ("state","sort_order");--> statement-breakpoint
CREATE INDEX "prose_revision_translation_idx" ON "prose_revision" USING btree ("prose_translation_id","created_at");--> statement-breakpoint
CREATE INDEX "prose_revision_assets_idx" ON "prose_revision" USING gin ("asset_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "prose_translation_member_locale_uq" ON "prose_translation" USING btree ("member_profile_id","locale") WHERE "prose_translation"."member_profile_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "prose_translation_match_locale_uq" ON "prose_translation" USING btree ("match_id","locale") WHERE "prose_translation"."match_id" is not null;