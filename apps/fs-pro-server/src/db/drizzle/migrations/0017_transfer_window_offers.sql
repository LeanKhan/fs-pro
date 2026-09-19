ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "TransferWindowOpen" boolean NOT NULL DEFAULT false;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "TransferWindowClosesDay" integer;

CREATE TABLE IF NOT EXISTS "TransferOffers" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"PlayerId" uuid NOT NULL REFERENCES "Players"("_id"),
	"FromClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
	"ToClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
	"Amount" real NOT NULL,
	"CounterAmount" real,
	"Status" text NOT NULL DEFAULT 'pending',
	"Initiator" text NOT NULL,
	"Note" text,
	"CreatedDay" integer NOT NULL,
	"ExpiresDay" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "transfer_offers_to_status_idx" ON "TransferOffers" ("ToClubId", "Status");
CREATE INDEX IF NOT EXISTS "transfer_offers_from_status_idx" ON "TransferOffers" ("FromClubId", "Status");
CREATE INDEX IF NOT EXISTS "transfer_offers_player_idx" ON "TransferOffers" ("PlayerId");
