CREATE TABLE "CompetitionClubs" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"Competition" uuid NOT NULL,
	"Club" uuid NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "CompetitionClubs_Competition_Club_unique" UNIQUE("Competition","Club")
);
--> statement-breakpoint
ALTER TABLE "Awards" ALTER COLUMN "Recipient" SET DATA TYPE uuid USING "Recipient"::uuid;--> statement-breakpoint
ALTER TABLE "Awards" ALTER COLUMN "Club" SET DATA TYPE uuid USING "Club"::uuid;--> statement-breakpoint
ALTER TABLE "Awards" ALTER COLUMN "Season" SET DATA TYPE uuid USING "Season"::uuid;--> statement-breakpoint
ALTER TABLE "ClubMatchDetails" ALTER COLUMN "Club" SET DATA TYPE uuid USING "Club"::uuid;--> statement-breakpoint
ALTER TABLE "ClubMatchDetails" ALTER COLUMN "Fixture" SET DATA TYPE uuid USING "Fixture"::uuid;--> statement-breakpoint
ALTER TABLE "Clubs" ALTER COLUMN "Manager" SET DATA TYPE uuid USING "Manager"::uuid;--> statement-breakpoint
ALTER TABLE "Clubs" ALTER COLUMN "League" SET DATA TYPE uuid USING "League"::uuid;--> statement-breakpoint
ALTER TABLE "Clubs" ALTER COLUMN "User" SET DATA TYPE uuid USING "User"::uuid;--> statement-breakpoint
ALTER TABLE "Competitions" ALTER COLUMN "Country" SET DATA TYPE uuid USING "Country"::uuid;--> statement-breakpoint
ALTER TABLE "Days" ALTER COLUMN "Calendar" SET DATA TYPE uuid USING "Calendar"::uuid;--> statement-breakpoint
ALTER TABLE "Fixtures" ALTER COLUMN "Season" SET DATA TYPE uuid USING "Season"::uuid;--> statement-breakpoint
ALTER TABLE "Fixtures" ALTER COLUMN "ReverseFixture" SET DATA TYPE uuid USING "ReverseFixture"::uuid;--> statement-breakpoint
ALTER TABLE "Fixtures" ALTER COLUMN "HomeTeam" SET DATA TYPE uuid USING "HomeTeam"::uuid;--> statement-breakpoint
ALTER TABLE "Fixtures" ALTER COLUMN "AwayTeam" SET DATA TYPE uuid USING "AwayTeam"::uuid;--> statement-breakpoint
ALTER TABLE "Fixtures" ALTER COLUMN "HomeSideDetails" SET DATA TYPE uuid USING "HomeSideDetails"::uuid;--> statement-breakpoint
ALTER TABLE "Fixtures" ALTER COLUMN "AwaySideDetails" SET DATA TYPE uuid USING "AwaySideDetails"::uuid;--> statement-breakpoint
ALTER TABLE "Fixtures" ALTER COLUMN "HomeManager" SET DATA TYPE uuid USING "HomeManager"::uuid;--> statement-breakpoint
ALTER TABLE "Fixtures" ALTER COLUMN "AwayManager" SET DATA TYPE uuid USING "AwayManager"::uuid;--> statement-breakpoint
ALTER TABLE "Managers" ALTER COLUMN "Club" SET DATA TYPE uuid USING "Club"::uuid;--> statement-breakpoint
ALTER TABLE "Managers" ALTER COLUMN "Nationality" SET DATA TYPE uuid USING "Nationality"::uuid;--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" ALTER COLUMN "Player" SET DATA TYPE uuid USING "Player"::uuid;--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" ALTER COLUMN "Fixture" SET DATA TYPE uuid USING "Fixture"::uuid;--> statement-breakpoint
ALTER TABLE "Players" ALTER COLUMN "Nationality" SET DATA TYPE uuid USING "Nationality"::uuid;--> statement-breakpoint
ALTER TABLE "Players" ALTER COLUMN "Club" SET DATA TYPE uuid USING "Club"::uuid;--> statement-breakpoint
ALTER TABLE "Seasons" ALTER COLUMN "Winner" SET DATA TYPE uuid USING "Winner"::uuid;--> statement-breakpoint
ALTER TABLE "Seasons" ALTER COLUMN "Promoted" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Seasons" ALTER COLUMN "Promoted" SET DATA TYPE uuid[] USING "Promoted"::uuid[];--> statement-breakpoint
ALTER TABLE "Seasons" ALTER COLUMN "Promoted" SET DEFAULT ARRAY[]::uuid[];--> statement-breakpoint
ALTER TABLE "Seasons" ALTER COLUMN "Relegated" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Seasons" ALTER COLUMN "Relegated" SET DATA TYPE uuid[] USING "Relegated"::uuid[];--> statement-breakpoint
ALTER TABLE "Seasons" ALTER COLUMN "Relegated" SET DEFAULT ARRAY[]::uuid[];--> statement-breakpoint
ALTER TABLE "Seasons" ALTER COLUMN "Calendar" SET DATA TYPE uuid USING "Calendar"::uuid;--> statement-breakpoint
ALTER TABLE "Seasons" ALTER COLUMN "Competition" SET DATA TYPE uuid USING "Competition"::uuid;--> statement-breakpoint
ALTER TABLE "Clubs" ADD COLUMN "AddressCountry" uuid;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD COLUMN "HomeTactic" text;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD COLUMN "AwayTactic" text;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD COLUMN "SaveStats" boolean;--> statement-breakpoint
ALTER TABLE "Managers" ADD COLUMN "PreferredFormation" text;--> statement-breakpoint
ALTER TABLE "Managers" ADD COLUMN "PreferredStyle" text;--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" ADD COLUMN "ClubMatchDetails" uuid;--> statement-breakpoint
ALTER TABLE "CompetitionClubs" ADD CONSTRAINT "CompetitionClubs_Competition_Competitions__id_fk" FOREIGN KEY ("Competition") REFERENCES "public"."Competitions"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CompetitionClubs" ADD CONSTRAINT "CompetitionClubs_Club_Clubs__id_fk" FOREIGN KEY ("Club") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Awards" ADD CONSTRAINT "Awards_Club_Clubs__id_fk" FOREIGN KEY ("Club") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Awards" ADD CONSTRAINT "Awards_Season_Seasons__id_fk" FOREIGN KEY ("Season") REFERENCES "public"."Seasons"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ClubMatchDetails" ADD CONSTRAINT "ClubMatchDetails_Club_Clubs__id_fk" FOREIGN KEY ("Club") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ClubMatchDetails" ADD CONSTRAINT "ClubMatchDetails_Fixture_Fixtures__id_fk" FOREIGN KEY ("Fixture") REFERENCES "public"."Fixtures"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Clubs" ADD CONSTRAINT "Clubs_Manager_Managers__id_fk" FOREIGN KEY ("Manager") REFERENCES "public"."Managers"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Clubs" ADD CONSTRAINT "Clubs_AddressCountry_Places__id_fk" FOREIGN KEY ("AddressCountry") REFERENCES "public"."Places"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Clubs" ADD CONSTRAINT "Clubs_League_Competitions__id_fk" FOREIGN KEY ("League") REFERENCES "public"."Competitions"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Clubs" ADD CONSTRAINT "Clubs_User_Users__id_fk" FOREIGN KEY ("User") REFERENCES "public"."Users"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Competitions" ADD CONSTRAINT "Competitions_Country_Places__id_fk" FOREIGN KEY ("Country") REFERENCES "public"."Places"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Days" ADD CONSTRAINT "Days_Calendar_Calendars__id_fk" FOREIGN KEY ("Calendar") REFERENCES "public"."Calendars"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_Season_Seasons__id_fk" FOREIGN KEY ("Season") REFERENCES "public"."Seasons"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_ReverseFixture_Fixtures__id_fk" FOREIGN KEY ("ReverseFixture") REFERENCES "public"."Fixtures"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_HomeTeam_Clubs__id_fk" FOREIGN KEY ("HomeTeam") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_AwayTeam_Clubs__id_fk" FOREIGN KEY ("AwayTeam") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_HomeSideDetails_ClubMatchDetails__id_fk" FOREIGN KEY ("HomeSideDetails") REFERENCES "public"."ClubMatchDetails"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_AwaySideDetails_ClubMatchDetails__id_fk" FOREIGN KEY ("AwaySideDetails") REFERENCES "public"."ClubMatchDetails"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_HomeManager_Managers__id_fk" FOREIGN KEY ("HomeManager") REFERENCES "public"."Managers"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_AwayManager_Managers__id_fk" FOREIGN KEY ("AwayManager") REFERENCES "public"."Managers"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Managers" ADD CONSTRAINT "Managers_Club_Clubs__id_fk" FOREIGN KEY ("Club") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Managers" ADD CONSTRAINT "Managers_Nationality_Places__id_fk" FOREIGN KEY ("Nationality") REFERENCES "public"."Places"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" ADD CONSTRAINT "PlayerMatchDetails_Player_Players__id_fk" FOREIGN KEY ("Player") REFERENCES "public"."Players"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" ADD CONSTRAINT "PlayerMatchDetails_Fixture_Fixtures__id_fk" FOREIGN KEY ("Fixture") REFERENCES "public"."Fixtures"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" ADD CONSTRAINT "PlayerMatchDetails_ClubMatchDetails_ClubMatchDetails__id_fk" FOREIGN KEY ("ClubMatchDetails") REFERENCES "public"."ClubMatchDetails"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Players" ADD CONSTRAINT "Players_Nationality_Places__id_fk" FOREIGN KEY ("Nationality") REFERENCES "public"."Places"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Players" ADD CONSTRAINT "Players_Club_Clubs__id_fk" FOREIGN KEY ("Club") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Seasons" ADD CONSTRAINT "Seasons_Winner_Clubs__id_fk" FOREIGN KEY ("Winner") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Seasons" ADD CONSTRAINT "Seasons_Calendar_Calendars__id_fk" FOREIGN KEY ("Calendar") REFERENCES "public"."Calendars"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Seasons" ADD CONSTRAINT "Seasons_Competition_Competitions__id_fk" FOREIGN KEY ("Competition") REFERENCES "public"."Competitions"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Calendars" DROP COLUMN "Days";--> statement-breakpoint
ALTER TABLE "ClubMatchDetails" DROP COLUMN "PlayerStats";--> statement-breakpoint
ALTER TABLE "Clubs" DROP COLUMN "Players";--> statement-breakpoint
ALTER TABLE "Competitions" DROP COLUMN "Clubs";--> statement-breakpoint
ALTER TABLE "Competitions" DROP COLUMN "Seasons";--> statement-breakpoint
ALTER TABLE "Seasons" DROP COLUMN "Fixtures";--> statement-breakpoint
ALTER TABLE "Users" DROP COLUMN "Clubs";