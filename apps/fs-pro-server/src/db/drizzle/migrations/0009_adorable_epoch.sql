ALTER TABLE "Awards" RENAME COLUMN "Recipient" TO "RecipientId";--> statement-breakpoint
ALTER TABLE "Awards" RENAME COLUMN "Club" TO "ClubId";--> statement-breakpoint
ALTER TABLE "Awards" RENAME COLUMN "Season" TO "SeasonId";--> statement-breakpoint
ALTER TABLE "ClubMatchDetails" RENAME COLUMN "Club" TO "ClubId";--> statement-breakpoint
ALTER TABLE "ClubMatchDetails" RENAME COLUMN "Fixture" TO "FixtureId";--> statement-breakpoint
ALTER TABLE "Clubs" RENAME COLUMN "Manager" TO "ManagerId";--> statement-breakpoint
ALTER TABLE "Clubs" RENAME COLUMN "AddressCountry" TO "AddressCountryId";--> statement-breakpoint
ALTER TABLE "Clubs" RENAME COLUMN "League" TO "LeagueId";--> statement-breakpoint
ALTER TABLE "Clubs" RENAME COLUMN "User" TO "UserId";--> statement-breakpoint
ALTER TABLE "CompetitionClubs" RENAME COLUMN "Competition" TO "CompetitionId";--> statement-breakpoint
ALTER TABLE "CompetitionClubs" RENAME COLUMN "Club" TO "ClubId";--> statement-breakpoint
ALTER TABLE "Competitions" RENAME COLUMN "Country" TO "CountryId";--> statement-breakpoint
ALTER TABLE "Fixtures" RENAME COLUMN "Season" TO "SeasonId";--> statement-breakpoint
ALTER TABLE "Fixtures" RENAME COLUMN "ReverseFixture" TO "ReverseFixtureId";--> statement-breakpoint
ALTER TABLE "Fixtures" RENAME COLUMN "HomeTeam" TO "HomeTeamId";--> statement-breakpoint
ALTER TABLE "Fixtures" RENAME COLUMN "AwayTeam" TO "AwayTeamId";--> statement-breakpoint
ALTER TABLE "Fixtures" RENAME COLUMN "HomeSideDetails" TO "HomeSideDetailsId";--> statement-breakpoint
ALTER TABLE "Fixtures" RENAME COLUMN "AwaySideDetails" TO "AwaySideDetailsId";--> statement-breakpoint
ALTER TABLE "Fixtures" RENAME COLUMN "HomeManager" TO "HomeManagerId";--> statement-breakpoint
ALTER TABLE "Fixtures" RENAME COLUMN "AwayManager" TO "AwayManagerId";--> statement-breakpoint
ALTER TABLE "Managers" RENAME COLUMN "Club" TO "ClubId";--> statement-breakpoint
ALTER TABLE "Managers" RENAME COLUMN "Nationality" TO "NationalityId";--> statement-breakpoint
ALTER TABLE "MatchReplays" RENAME COLUMN "Fixture" TO "FixtureId";--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" RENAME COLUMN "Player" TO "PlayerId";--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" RENAME COLUMN "Fixture" TO "FixtureId";--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" RENAME COLUMN "ClubMatchDetails" TO "ClubMatchDetailsId";--> statement-breakpoint
ALTER TABLE "Players" RENAME COLUMN "Nationality" TO "NationalityId";--> statement-breakpoint
ALTER TABLE "Players" RENAME COLUMN "Club" TO "ClubId";--> statement-breakpoint
ALTER TABLE "Seasons" RENAME COLUMN "Winner" TO "WinnerId";--> statement-breakpoint
ALTER TABLE "Seasons" RENAME COLUMN "Competition" TO "CompetitionId";--> statement-breakpoint
ALTER TABLE "CompetitionClubs" DROP CONSTRAINT "CompetitionClubs_Competition_Club_unique";--> statement-breakpoint
ALTER TABLE "MatchReplays" DROP CONSTRAINT "MatchReplays_Fixture_unique";--> statement-breakpoint
ALTER TABLE "Awards" DROP CONSTRAINT "Awards_Club_Clubs__id_fk";
--> statement-breakpoint
ALTER TABLE "Awards" DROP CONSTRAINT "Awards_Season_Seasons__id_fk";
--> statement-breakpoint
ALTER TABLE "ClubMatchDetails" DROP CONSTRAINT "ClubMatchDetails_Club_Clubs__id_fk";
--> statement-breakpoint
ALTER TABLE "ClubMatchDetails" DROP CONSTRAINT "ClubMatchDetails_Fixture_Fixtures__id_fk";
--> statement-breakpoint
ALTER TABLE "Clubs" DROP CONSTRAINT "Clubs_Manager_Managers__id_fk";
--> statement-breakpoint
ALTER TABLE "Clubs" DROP CONSTRAINT "Clubs_AddressCountry_Places__id_fk";
--> statement-breakpoint
ALTER TABLE "Clubs" DROP CONSTRAINT "Clubs_League_Competitions__id_fk";
--> statement-breakpoint
ALTER TABLE "Clubs" DROP CONSTRAINT "Clubs_User_Users__id_fk";
--> statement-breakpoint
ALTER TABLE "CompetitionClubs" DROP CONSTRAINT "CompetitionClubs_Competition_Competitions__id_fk";
--> statement-breakpoint
ALTER TABLE "CompetitionClubs" DROP CONSTRAINT "CompetitionClubs_Club_Clubs__id_fk";
--> statement-breakpoint
ALTER TABLE "Competitions" DROP CONSTRAINT "Competitions_Country_Places__id_fk";
--> statement-breakpoint
ALTER TABLE "Fixtures" DROP CONSTRAINT "Fixtures_Season_Seasons__id_fk";
--> statement-breakpoint
ALTER TABLE "Fixtures" DROP CONSTRAINT "Fixtures_ReverseFixture_Fixtures__id_fk";
--> statement-breakpoint
ALTER TABLE "Fixtures" DROP CONSTRAINT "Fixtures_HomeTeam_Clubs__id_fk";
--> statement-breakpoint
ALTER TABLE "Fixtures" DROP CONSTRAINT "Fixtures_AwayTeam_Clubs__id_fk";
--> statement-breakpoint
ALTER TABLE "Fixtures" DROP CONSTRAINT "Fixtures_HomeSideDetails_ClubMatchDetails__id_fk";
--> statement-breakpoint
ALTER TABLE "Fixtures" DROP CONSTRAINT "Fixtures_AwaySideDetails_ClubMatchDetails__id_fk";
--> statement-breakpoint
ALTER TABLE "Fixtures" DROP CONSTRAINT "Fixtures_HomeManager_Managers__id_fk";
--> statement-breakpoint
ALTER TABLE "Fixtures" DROP CONSTRAINT "Fixtures_AwayManager_Managers__id_fk";
--> statement-breakpoint
ALTER TABLE "Managers" DROP CONSTRAINT "Managers_Club_Clubs__id_fk";
--> statement-breakpoint
ALTER TABLE "Managers" DROP CONSTRAINT "Managers_Nationality_Places__id_fk";
--> statement-breakpoint
ALTER TABLE "MatchReplays" DROP CONSTRAINT "MatchReplays_Fixture_Fixtures__id_fk";
--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" DROP CONSTRAINT "PlayerMatchDetails_Player_Players__id_fk";
--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" DROP CONSTRAINT "PlayerMatchDetails_Fixture_Fixtures__id_fk";
--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" DROP CONSTRAINT "PlayerMatchDetails_ClubMatchDetails_ClubMatchDetails__id_fk";
--> statement-breakpoint
ALTER TABLE "Players" DROP CONSTRAINT "Players_Nationality_Places__id_fk";
--> statement-breakpoint
ALTER TABLE "Players" DROP CONSTRAINT "Players_Club_Clubs__id_fk";
--> statement-breakpoint
ALTER TABLE "Seasons" DROP CONSTRAINT "Seasons_Winner_Clubs__id_fk";
--> statement-breakpoint
ALTER TABLE "Seasons" DROP CONSTRAINT "Seasons_Competition_Competitions__id_fk";
--> statement-breakpoint
DROP INDEX "fixtures_season_scheduled_day_idx";--> statement-breakpoint
ALTER TABLE "Awards" ADD CONSTRAINT "Awards_ClubId_Clubs__id_fk" FOREIGN KEY ("ClubId") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Awards" ADD CONSTRAINT "Awards_SeasonId_Seasons__id_fk" FOREIGN KEY ("SeasonId") REFERENCES "public"."Seasons"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ClubMatchDetails" ADD CONSTRAINT "ClubMatchDetails_ClubId_Clubs__id_fk" FOREIGN KEY ("ClubId") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ClubMatchDetails" ADD CONSTRAINT "ClubMatchDetails_FixtureId_Fixtures__id_fk" FOREIGN KEY ("FixtureId") REFERENCES "public"."Fixtures"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Clubs" ADD CONSTRAINT "Clubs_ManagerId_Managers__id_fk" FOREIGN KEY ("ManagerId") REFERENCES "public"."Managers"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Clubs" ADD CONSTRAINT "Clubs_AddressCountryId_Places__id_fk" FOREIGN KEY ("AddressCountryId") REFERENCES "public"."Places"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Clubs" ADD CONSTRAINT "Clubs_LeagueId_Competitions__id_fk" FOREIGN KEY ("LeagueId") REFERENCES "public"."Competitions"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Clubs" ADD CONSTRAINT "Clubs_UserId_Users__id_fk" FOREIGN KEY ("UserId") REFERENCES "public"."Users"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CompetitionClubs" ADD CONSTRAINT "CompetitionClubs_CompetitionId_Competitions__id_fk" FOREIGN KEY ("CompetitionId") REFERENCES "public"."Competitions"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CompetitionClubs" ADD CONSTRAINT "CompetitionClubs_ClubId_Clubs__id_fk" FOREIGN KEY ("ClubId") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Competitions" ADD CONSTRAINT "Competitions_CountryId_Places__id_fk" FOREIGN KEY ("CountryId") REFERENCES "public"."Places"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_SeasonId_Seasons__id_fk" FOREIGN KEY ("SeasonId") REFERENCES "public"."Seasons"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_ReverseFixtureId_Fixtures__id_fk" FOREIGN KEY ("ReverseFixtureId") REFERENCES "public"."Fixtures"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_HomeTeamId_Clubs__id_fk" FOREIGN KEY ("HomeTeamId") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_AwayTeamId_Clubs__id_fk" FOREIGN KEY ("AwayTeamId") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_HomeSideDetailsId_ClubMatchDetails__id_fk" FOREIGN KEY ("HomeSideDetailsId") REFERENCES "public"."ClubMatchDetails"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_AwaySideDetailsId_ClubMatchDetails__id_fk" FOREIGN KEY ("AwaySideDetailsId") REFERENCES "public"."ClubMatchDetails"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_HomeManagerId_Managers__id_fk" FOREIGN KEY ("HomeManagerId") REFERENCES "public"."Managers"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Fixtures" ADD CONSTRAINT "Fixtures_AwayManagerId_Managers__id_fk" FOREIGN KEY ("AwayManagerId") REFERENCES "public"."Managers"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Managers" ADD CONSTRAINT "Managers_ClubId_Clubs__id_fk" FOREIGN KEY ("ClubId") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Managers" ADD CONSTRAINT "Managers_NationalityId_Places__id_fk" FOREIGN KEY ("NationalityId") REFERENCES "public"."Places"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "MatchReplays" ADD CONSTRAINT "MatchReplays_FixtureId_Fixtures__id_fk" FOREIGN KEY ("FixtureId") REFERENCES "public"."Fixtures"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" ADD CONSTRAINT "PlayerMatchDetails_PlayerId_Players__id_fk" FOREIGN KEY ("PlayerId") REFERENCES "public"."Players"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" ADD CONSTRAINT "PlayerMatchDetails_FixtureId_Fixtures__id_fk" FOREIGN KEY ("FixtureId") REFERENCES "public"."Fixtures"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" ADD CONSTRAINT "PlayerMatchDetails_ClubMatchDetailsId_ClubMatchDetails__id_fk" FOREIGN KEY ("ClubMatchDetailsId") REFERENCES "public"."ClubMatchDetails"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Players" ADD CONSTRAINT "Players_NationalityId_Places__id_fk" FOREIGN KEY ("NationalityId") REFERENCES "public"."Places"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Players" ADD CONSTRAINT "Players_ClubId_Clubs__id_fk" FOREIGN KEY ("ClubId") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Seasons" ADD CONSTRAINT "Seasons_WinnerId_Clubs__id_fk" FOREIGN KEY ("WinnerId") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Seasons" ADD CONSTRAINT "Seasons_CompetitionId_Competitions__id_fk" FOREIGN KEY ("CompetitionId") REFERENCES "public"."Competitions"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fixtures_season_scheduled_day_idx" ON "Fixtures" USING btree ("SeasonId","ScheduledDay");--> statement-breakpoint
ALTER TABLE "CompetitionClubs" ADD CONSTRAINT "CompetitionClubs_CompetitionId_ClubId_unique" UNIQUE("CompetitionId","ClubId");--> statement-breakpoint
ALTER TABLE "MatchReplays" ADD CONSTRAINT "MatchReplays_FixtureId_unique" UNIQUE("FixtureId");