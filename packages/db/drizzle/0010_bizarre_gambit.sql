CREATE TABLE "logi_member_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"scope_key" text NOT NULL,
	"source_instance_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"game_id" text NOT NULL,
	"member_id" text NOT NULL,
	"identity_id" text NOT NULL,
	"allow_stats" boolean DEFAULT false NOT NULL,
	"allow_roster" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logi_member_link_game_ck" CHECK ("logi_member_link"."game_id" in ('hell_let_loose', 'wardogs')),
	CONSTRAINT "logi_member_link_version_ck" CHECK ("logi_member_link"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "logi_member_link" ADD CONSTRAINT "logi_member_link_profile_id_member_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."member_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "logi_member_link_source_member_uq" ON "logi_member_link" USING btree ("source_instance_id","guild_id","game_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "logi_member_link_profile_game_uq" ON "logi_member_link" USING btree ("profile_id","game_id");