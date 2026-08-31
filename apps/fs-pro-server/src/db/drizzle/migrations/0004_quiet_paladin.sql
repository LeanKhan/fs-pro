ALTER TABLE "ClubMatchDetails" ALTER COLUMN "Possession" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "Clubs" ALTER COLUMN "Rating" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "Clubs" ALTER COLUMN "GK_Rating" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "Clubs" ALTER COLUMN "ATT_Rating" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "Clubs" ALTER COLUMN "DEF_Rating" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "Clubs" ALTER COLUMN "MID_Rating" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "Clubs" ALTER COLUMN "Budget" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" ALTER COLUMN "Points" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "PlayerMatchDetails" ALTER COLUMN "Form" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "Players" ALTER COLUMN "Rating" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "Players" ALTER COLUMN "Value" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "Players" ALTER COLUMN "Form" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "Players" ALTER COLUMN "Form" SET DEFAULT 6;