CREATE TABLE "TransferLedger" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"Type" text NOT NULL,
	"PlayerId" uuid,
	"BuyerClubId" uuid,
	"SellerClubId" uuid,
	"Amount" real NOT NULL,
	"Year" text,
	"Note" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Players" ADD COLUMN "Wage" real;--> statement-breakpoint
ALTER TABLE "TransferLedger" ADD CONSTRAINT "TransferLedger_PlayerId_Players__id_fk" FOREIGN KEY ("PlayerId") REFERENCES "public"."Players"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TransferLedger" ADD CONSTRAINT "TransferLedger_BuyerClubId_Clubs__id_fk" FOREIGN KEY ("BuyerClubId") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TransferLedger" ADD CONSTRAINT "TransferLedger_SellerClubId_Clubs__id_fk" FOREIGN KEY ("SellerClubId") REFERENCES "public"."Clubs"("_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfer_ledger_player_idx" ON "TransferLedger" USING btree ("PlayerId");--> statement-breakpoint
CREATE INDEX "transfer_ledger_buyer_idx" ON "TransferLedger" USING btree ("BuyerClubId");--> statement-breakpoint
CREATE INDEX "transfer_ledger_seller_idx" ON "TransferLedger" USING btree ("SellerClubId");--> statement-breakpoint
CREATE INDEX "transfer_ledger_type_year_idx" ON "TransferLedger" USING btree ("Type","Year");