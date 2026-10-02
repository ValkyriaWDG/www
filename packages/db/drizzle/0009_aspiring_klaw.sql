CREATE TABLE "logi_command" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"scope_key" text NOT NULL,
	"source_instance_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"game_id" text NOT NULL,
	"body_hash" text NOT NULL,
	"body" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"receipt" jsonb,
	"next_attempt_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logi_command_state_ck" CHECK ("logi_command"."state" in ('pending', 'confirmed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "logi_inbox" (
	"source_instance_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"delivery_id" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"event_type" text NOT NULL,
	"body_hash" text NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "logi_inbox_source_instance_id_guild_id_delivery_id_pk" PRIMARY KEY("source_instance_id","guild_id","delivery_id")
);
--> statement-breakpoint
CREATE TABLE "logi_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_key" text NOT NULL,
	"source_instance_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"game_id" text NOT NULL,
	"subject" text NOT NULL,
	"revision" text NOT NULL,
	"epoch" text NOT NULL,
	"state" text NOT NULL,
	"role_ids" text[] NOT NULL,
	"observed_at" timestamp with time zone,
	"received_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logi_membership_revision_ck" CHECK ("logi_membership"."revision" ~ '^(0|[1-9][0-9]{0,127})$'),
	CONSTRAINT "logi_membership_epoch_ck" CHECK ("logi_membership"."epoch" ~ '^(0|[1-9][0-9]{0,127})$'),
	CONSTRAINT "logi_membership_state_ck" CHECK ("logi_membership"."state" in ('present', 'left', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "logi_projection" (
	"scope_key" text NOT NULL,
	"generation" text NOT NULL,
	"resource" text NOT NULL,
	"external_id" text NOT NULL,
	"revision" text NOT NULL,
	"operation" text NOT NULL,
	"data" jsonb,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "logi_projection_scope_key_generation_resource_external_id_pk" PRIMARY KEY("scope_key","generation","resource","external_id"),
	CONSTRAINT "logi_projection_revision_ck" CHECK ("logi_projection"."revision" ~ '^(0|[1-9][0-9]{0,127})$'),
	CONSTRAINT "logi_projection_operation_ck" CHECK ("logi_projection"."operation" in ('upsert', 'remove')),
	CONSTRAINT "logi_projection_data_ck" CHECK (("logi_projection"."operation" = 'upsert' and "logi_projection"."data" is not null) or ("logi_projection"."operation" = 'remove' and "logi_projection"."data" is null))
);
--> statement-breakpoint
CREATE TABLE "logi_sync_scope" (
	"scope_key" text PRIMARY KEY NOT NULL,
	"source_instance_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"game_id" text NOT NULL,
	"checkpoint" jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"active_generation" text,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "logi_issuer" text;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "logi_client_id" text;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "logi_subject" text;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "logi_sid" text;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "logi_guild_id" text;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "logi_access_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "logi_access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "logi_command" ADD CONSTRAINT "logi_command_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logi_projection" ADD CONSTRAINT "logi_projection_scope_key_logi_sync_scope_scope_key_fk" FOREIGN KEY ("scope_key") REFERENCES "public"."logi_sync_scope"("scope_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logi_command_user_idx" ON "logi_command" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "logi_inbox_pending_idx" ON "logi_inbox" USING btree ("source_instance_id","guild_id","received_at") WHERE "logi_inbox"."processed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "logi_membership_scope_subject_uq" ON "logi_membership" USING btree ("scope_key","subject");--> statement-breakpoint
CREATE INDEX "logi_membership_subject_idx" ON "logi_membership" USING btree ("subject");