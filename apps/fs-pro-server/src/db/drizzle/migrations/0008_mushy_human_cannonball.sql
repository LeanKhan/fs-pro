DROP INDEX "fixtures_scheduled_day_idx";--> statement-breakpoint
DROP INDEX "fixtures_season_scheduled_day_idx";--> statement-breakpoint
CREATE INDEX "fixtures_scheduled_day_idx" ON "Fixtures" USING btree ("ScheduledDay");--> statement-breakpoint
CREATE INDEX "fixtures_season_scheduled_day_idx" ON "Fixtures" USING btree ("Season","ScheduledDay");