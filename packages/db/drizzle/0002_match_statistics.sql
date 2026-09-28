CREATE TABLE "match_statistics" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_label" text DEFAULT '' NOT NULL,
	"external_game_id" text,
	"map_name" text,
	"mode" text,
	"game_started_at" timestamp with time zone,
	"game_ended_at" timestamp with time zone,
	"result_allied" integer,
	"result_axis" integer,
	"valkyria_side" text NOT NULL,
	"teams" jsonb NOT NULL,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"publish_players" boolean DEFAULT false NOT NULL,
	"imported_by" uuid,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_statistics_source_ck" CHECK ("match_statistics"."source" in ('crcon', 'upload')),
	CONSTRAINT "match_statistics_side_ck" CHECK ("match_statistics"."valkyria_side" in ('allies', 'axis')),
	CONSTRAINT "match_statistics_external_id_ck" CHECK ("match_statistics"."external_game_id" is null or "match_statistics"."external_game_id" ~ '^[A-Za-z0-9_.:-]{1,64}$'),
	CONSTRAINT "match_statistics_label_ck" CHECK (length("match_statistics"."source_label") <= 120),
	CONSTRAINT "match_statistics_result_ck" CHECK (("match_statistics"."result_allied" is null and "match_statistics"."result_axis" is null) or ("match_statistics"."result_allied" between 0 and 5 and "match_statistics"."result_axis" between 0 and 5)),
	CONSTRAINT "match_statistics_players_ck" CHECK (jsonb_typeof("match_statistics"."players") = 'array' and jsonb_array_length("match_statistics"."players") <= 200)
);
--> statement-breakpoint
ALTER TABLE "match_statistics" ADD CONSTRAINT "match_statistics_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_statistics" ADD CONSTRAINT "match_statistics_imported_by_auth_user_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;