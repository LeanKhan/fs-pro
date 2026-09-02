CREATE TABLE "MatchReplays" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mongoId" text,
	"Fixture" uuid NOT NULL,
	"Home" jsonb,
	"Away" jsonb,
	"Frames" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"Details" jsonb,
	"TickMs" integer,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "MatchReplays_mongoId_unique" UNIQUE("mongoId"),
	CONSTRAINT "MatchReplays_Fixture_unique" UNIQUE("Fixture")
);
--> statement-breakpoint
ALTER TABLE "MatchReplays" ADD CONSTRAINT "MatchReplays_Fixture_Fixtures__id_fk" FOREIGN KEY ("Fixture") REFERENCES "public"."Fixtures"("_id") ON DELETE no action ON UPDATE no action;