CREATE TABLE "discord_role_sync_member" (
	"producer" text NOT NULL,
	"guild_id" text NOT NULL,
	"discord_user_id" text NOT NULL,
	"sequence" numeric(30, 0) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"role_ids" text[] NOT NULL,
	CONSTRAINT "discord_role_sync_member_producer_guild_id_discord_user_id_pk" PRIMARY KEY("producer","guild_id","discord_user_id"),
	CONSTRAINT "discord_role_sync_member_sequence_ck" CHECK ("discord_role_sync_member"."sequence" > 0),
	CONSTRAINT "discord_role_sync_member_state_ck" CHECK ("discord_role_sync_member"."state" in ('present','left'))
);
--> statement-breakpoint
CREATE TABLE "discord_role_sync_nonce" (
	"producer" text NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discord_role_sync_nonce_producer_nonce_pk" PRIMARY KEY("producer","nonce")
);
--> statement-breakpoint
CREATE TABLE "discord_role_sync_receipt" (
	"producer" text NOT NULL,
	"event_id" uuid NOT NULL,
	"body_digest" text NOT NULL,
	"outcome" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discord_role_sync_receipt_producer_event_id_pk" PRIMARY KEY("producer","event_id"),
	CONSTRAINT "discord_role_sync_receipt_outcome_ck" CHECK ("discord_role_sync_receipt"."outcome" in ('applied','stale'))
);
--> statement-breakpoint
ALTER TABLE "guild_membership" DROP CONSTRAINT "guild_membership_guild_snowflake_ck";--> statement-breakpoint
ALTER TABLE "guild_membership" DROP CONSTRAINT "guild_membership_user_snowflake_ck";--> statement-breakpoint
ALTER TABLE "guild_membership" ADD COLUMN "authorization_generation" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "discord_role_sync_nonce_expiry_idx" ON "discord_role_sync_nonce" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "discord_role_sync_receipt_age_idx" ON "discord_role_sync_receipt" USING btree ("received_at");--> statement-breakpoint
ALTER TABLE "guild_membership" ADD CONSTRAINT "guild_membership_guild_snowflake_ck" CHECK ("guild_membership"."guild_id" ~ '^[0-9]{1,25}$');--> statement-breakpoint
ALTER TABLE "guild_membership" ADD CONSTRAINT "guild_membership_user_snowflake_ck" CHECK ("guild_membership"."discord_user_id" ~ '^[0-9]{1,25}$');