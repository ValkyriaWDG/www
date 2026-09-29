CREATE TABLE "legacy_match_scoreboard" (
	"match_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "legacy_match_scoreboard_match_id_ordinal_pk" PRIMARY KEY("match_id","ordinal"),
	CONSTRAINT "legacy_match_scoreboard_ordinal_ck" CHECK ("legacy_match_scoreboard"."ordinal" between 2 and 50),
	CONSTRAINT "legacy_match_scoreboard_snapshot_ck" CHECK (jsonb_typeof("legacy_match_scoreboard"."snapshot") = 'object' and jsonb_typeof("legacy_match_scoreboard"."snapshot"->'players') = 'array' and jsonb_array_length("legacy_match_scoreboard"."snapshot"->'players') <= 200)
);
--> statement-breakpoint
ALTER TABLE "legacy_match_scoreboard" ADD CONSTRAINT "legacy_match_scoreboard_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;