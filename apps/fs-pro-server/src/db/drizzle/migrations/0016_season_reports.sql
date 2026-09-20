CREATE TABLE IF NOT EXISTS "SeasonReports" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"Year" text NOT NULL,
	"Data" jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "SeasonReports_Year_unique" UNIQUE("Year")
);
