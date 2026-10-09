package transfer

import (
	"context"
	"fmt"
	"math"
	"math/rand"

	"fs-pro-server/internal/club"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/player"
)

// Market constants, ported from transfer-market.service.ts.
const (
	minSquadSize       = 12
	minBidShare        = 0.5
	maxOpenBidsPerClub = 5
	offerLifetimeDays  = 4
	openStatusesSQL    = `('pending','countered')`
)

// AssertWindowOpen mirrors assertTransferWindowOpen.
func (r *Repository) AssertWindowOpen(ctx context.Context) error {
	state, err := r.Window(ctx)
	if err != nil {
		return err
	}
	if !state.Open {
		return fmt.Errorf("The transfer window is closed")
	}
	return nil
}

// AiResponse is the pure AI bid decision (ported aiResponse).
func AiResponse(amount, value float64, isKeyPlayer bool, sellerSquadSize int, bidderRep, sellerRep float64) (decision string, ask int64, reason string) {
	repGap := sellerRep - bidderRep
	premium := math.Min(math.Max(repGap, 0)/100, 0.3)
	multiplier := 1.05 + boolF(isKeyPlayer, 0.25) + premium + (rand.Float64()*0.15 - 0.05)
	ask = int64(math.Round(value * multiplier))
	if sellerSquadSize <= minSquadSize {
		return "rejected", ask, "They cannot sell - their squad is too thin"
	}
	if isKeyPlayer && repGap >= 25 {
		return "rejected", ask, "He is not interested in joining a club of your stature"
	}
	if amount >= float64(ask) {
		return "accepted", ask, ""
	}
	if amount >= float64(ask)*0.75 {
		return "countered", ask, ""
	}
	return "rejected", ask, "Offer far below their valuation"
}

func boolF(b bool, f float64) float64 {
	if b {
		return f
	}
	return 0
}

func one(ctx context.Context, q db.Querier, sqlStr string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sqlStr, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func all(ctx context.Context, q db.Querier, sqlStr string, args ...any) ([]map[string]any, error) {
	rows, err := q.Query(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// ExecutePurchase is the instant free-agent purchase (executePurchase).
func (r *Repository) ExecutePurchase(ctx context.Context, playerID, buyingClubID string, offerAmount float64) (map[string]any, error) {
	playerRow, pOk, err := one(ctx, r.q, `SELECT * FROM "Players" WHERE "_id" = $1 LIMIT 1`, playerID)
	if err != nil {
		return nil, err
	}
	buying, bOk, err := one(ctx, r.q, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, buyingClubID)
	if err != nil {
		return nil, err
	}
	if err := r.AssertWindowOpen(ctx); err != nil {
		return nil, err
	}
	if !pOk {
		return nil, fmt.Errorf("Player not found")
	}
	if !bOk {
		return nil, fmt.Errorf("Buying club not found")
	}
	if db.StringField(playerRow, "ClubId") == buyingClubID {
		return nil, fmt.Errorf("This player already belongs to your club")
	}
	if boolOf(playerRow["isRetired"]) {
		return nil, fmt.Errorf("This player has retired and can no longer be transferred")
	}
	if db.StringField(playerRow, "ClubId") != "" {
		return nil, fmt.Errorf("This player is under contract - place a bid with his club instead")
	}
	value := floatOf(playerRow["Value"])
	if offerAmount < value {
		return nil, fmt.Errorf("Offer must be at least the player's Value (%d)", int(math.Round(value)))
	}
	if floatOf(buying["Budget"]) < offerAmount {
		return nil, fmt.Errorf("Insufficient Budget for this offer")
	}
	return r.settleTransfer(ctx, playerID, buyingClubID, offerAmount, "", nil)
}

// settleTransfer moves the player and settles money atomically, then refreshes
// both clubs' ratings.
func (r *Repository) settleTransfer(ctx context.Context, playerID, buyingClubID string, amount float64, note string, expectedSeller any) (map[string]any, error) {
	var sellerID string
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		// Lock the player row and require the expected current owner: nil means
		// the player must still be a free agent. This is the concurrency guard -
		// two racing settlements of one player can't both win.
		playerRow, ok, err := one(ctx, tx, `SELECT "ClubId" FROM "Players" WHERE "_id" = $1 FOR UPDATE`, playerID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("Player not found")
		}
		sellerID = db.StringField(playerRow, "ClubId")
		if !sellerMatches(sellerID, expectedSeller) {
			return fmt.Errorf("The player is no longer available")
		}
		// Lock the buying club and read its code in one row lock.
		buying, ok, err := one(ctx, tx, `SELECT "ClubCode" FROM "Clubs" WHERE "_id" = $1 FOR UPDATE`, buyingClubID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("Buying club not found")
		}

		// Guarded player move: fails (RowsAffected 0) if another settlement won.
		tag, err := tx.Exec(ctx, `UPDATE "Players" SET "isSigned" = true, "ClubId" = $2, "ClubCode" = $3,
			"isTransferListed" = false, "AskingPrice" = NULL, "updatedAt" = now()
			WHERE "_id" = $1 AND "isRetired" = false AND "ClubId" IS NOT DISTINCT FROM $4`,
			playerID, buyingClubID, db.StringField(buying, "ClubCode"), expectedSeller)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return fmt.Errorf("The player is no longer available")
		}

		// Guarded budget debit: cannot overdraw even if the balance changed.
		tag, err = tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) - $2, "updatedAt" = now()
			WHERE "_id" = $1 AND coalesce("Budget",0) >= $2`, buyingClubID, amount)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return fmt.Errorf("Insufficient Budget for this offer")
		}
		if sellerID != "" {
			if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) + $2, "updatedAt" = now() WHERE "_id" = $1`, sellerID, amount); err != nil {
				return err
			}
		}
		var seller any
		if sellerID != "" {
			seller = sellerID
		}
		var noteVal any
		if note != "" {
			noteVal = note
		}
		_, err = tx.Exec(ctx, `INSERT INTO "TransferLedger" ("Type","PlayerId","BuyerClubId","SellerClubId","Amount","Note","updatedAt")
			VALUES ('transfer',$1,$2,$3,$4,$5,now())`, playerID, buyingClubID, seller, amount, noteVal)
		return err
	})
	if err != nil {
		return nil, err
	}

	playerRepo := player.NewRepository(r.q)
	clubRepo := club.NewRepository(r.q)
	refreshedPlayer, _, perr := playerRepo.FindByID(ctx, playerID, false)
	if perr != nil {
		return nil, perr
	}
	refreshedBuying, _, berr := clubRepo.CalculateAndUpdateClubRating(ctx, buyingClubID)
	if berr != nil {
		return nil, berr
	}
	var refreshedSelling any
	if sellerID != "" {
		s, _, serr := clubRepo.CalculateAndUpdateClubRating(ctx, sellerID)
		if serr != nil {
			return nil, serr
		}
		refreshedSelling = s
	}
	return map[string]any{
		"player":      refreshedPlayer,
		"buyingClub":  refreshedBuying,
		"sellingClub": refreshedSelling,
	}, nil
}

// PlaceBid places a bid and lets an AI owner answer immediately.
func (r *Repository) PlaceBid(ctx context.Context, playerID, biddingClubID string, amount float64) (offerID string, err error) {
	if err := r.AssertWindowOpen(ctx); err != nil {
		return "", err
	}
	playerRow, ok, err := one(ctx, r.q, `SELECT * FROM "Players" WHERE "_id" = $1 LIMIT 1`, playerID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", fmt.Errorf("Player not found")
	}
	if boolOf(playerRow["isRetired"]) {
		return "", fmt.Errorf("This player has retired")
	}
	ownerID := db.StringField(playerRow, "ClubId")
	if ownerID == "" {
		return "", fmt.Errorf("He is a free agent - buy him outright instead of bidding")
	}
	if ownerID == biddingClubID {
		return "", fmt.Errorf("This player already belongs to your club")
	}
	if amount <= 0 {
		return "", fmt.Errorf("Bid must be positive")
	}
	value := floatOf(playerRow["Value"])
	if amount < value*minBidShare {
		return "", fmt.Errorf("Bid must be at least %d (half his value)", int(math.Round(value*minBidShare)))
	}
	bidder, bOk, err := one(ctx, r.q, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, biddingClubID)
	if err != nil {
		return "", err
	}
	owner, oOk, err := one(ctx, r.q, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, ownerID)
	if err != nil {
		return "", err
	}
	if !bOk {
		return "", fmt.Errorf("Bidding club not found")
	}
	if !oOk {
		return "", fmt.Errorf("Owning club not found")
	}
	if floatOf(bidder["Budget"]) < amount {
		return "", fmt.Errorf("Insufficient Budget for this bid")
	}
	open, err := all(ctx, r.q, `SELECT "PlayerId" FROM "TransferOffers" WHERE "FromClubId" = $1 AND "Status" IN `+openStatusesSQL, biddingClubID)
	if err != nil {
		return "", err
	}
	for _, o := range open {
		if db.StringField(o, "PlayerId") == playerID {
			return "", fmt.Errorf("You already have an open bid for this player")
		}
	}
	if len(open) >= maxOpenBidsPerClub {
		return "", fmt.Errorf("You can have at most %d open bids at once", maxOpenBidsPerClub)
	}

	day, err := r.currentDay(ctx)
	if err != nil {
		return "", err
	}
	created, err := db.InsertRow(ctx, r.q, "TransferOffers", map[string]any{
		"PlayerId": playerID, "FromClubId": biddingClubID, "ToClubId": ownerID,
		"Amount": amount, "Status": "pending", "Initiator": "user",
		"CreatedDay": day, "ExpiresDay": day + offerLifetimeDays,
	})
	if err != nil {
		return "", err
	}
	if offerID := db.StringField(created, "_id"); offerID != "" {
		id := offerID
		if db.StringField(owner, "UserId") != "" {
			return id, nil
		}
		roster, err := r.rosterOf(ctx, ownerID)
		if err != nil {
			return "", err
		}
		isKey := false
		for _, p := range roster {
			if db.StringField(p, "_id") == playerID {
				isKey = rankInRoster(p, roster) <= 3
				break
			}
		}
		decision, ask, reason := AiResponse(amount, value, isKey, len(roster), floatOf(bidder["Reputation"]), floatOf(owner["Reputation"]))
		switch decision {
		case "accepted":
			return id, r.settleOffer(ctx, id, amount)
		case "countered":
			return id, r.finishOffer(ctx, id, "countered", db.StringField(owner, "Name")+" want more", float64(ask))
		default:
			return id, r.finishOffer(ctx, id, "rejected", reason, 0)
		}
	}
	return "", fmt.Errorf("Offer insert failed")
}

// RespondToOffer is the club-turn answer to a pending/countered offer.
func (r *Repository) RespondToOffer(ctx context.Context, offerID, clubID, action string) (string, error) {
	offer, ok, err := one(ctx, r.q, `SELECT * FROM "TransferOffers" WHERE "_id" = $1 LIMIT 1`, offerID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", fmt.Errorf("Offer not found")
	}
	status := db.StringField(offer, "Status")
	if status != "pending" && status != "countered" {
		return "", fmt.Errorf("This offer is already %s", status)
	}
	responder := db.StringField(offer, "ToClubId")
	if status == "countered" {
		responder = db.StringField(offer, "FromClubId")
	}
	if clubID != responder {
		return "", fmt.Errorf("It is not your turn to answer this offer")
	}
	if action == "reject" {
		return db.StringField(offer, "_id"), r.finishOffer(ctx, offerID, "rejected", "Declined", 0)
	}
	if err := r.AssertWindowOpen(ctx); err != nil {
		return "", err
	}
	price := floatOf(offer["Amount"])
	if status == "countered" && offer["CounterAmount"] != nil {
		price = floatOf(offer["CounterAmount"])
	}
	return offerID, r.settleOffer(ctx, offerID, price)
}

func (r *Repository) settleOffer(ctx context.Context, offerID string, price float64) error {
	offer, ok, err := one(ctx, r.q, `SELECT * FROM "TransferOffers" WHERE "_id" = $1 LIMIT 1`, offerID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("Offer not found")
	}
	playerRow, pOk, err := one(ctx, r.q, `SELECT * FROM "Players" WHERE "_id" = $1 LIMIT 1`, db.StringField(offer, "PlayerId"))
	if err != nil {
		return err
	}
	toClub := db.StringField(offer, "ToClubId")
	fromClub := db.StringField(offer, "FromClubId")
	buyer, _, err := one(ctx, r.q, `SELECT "Budget" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, fromClub)
	if err != nil {
		return err
	}
	fail := func(reason string) error {
		_ = r.finishOffer(ctx, offerID, "failed", reason, 0)
		return fmt.Errorf("%s", reason)
	}
	if !pOk || boolOf(playerRow["isRetired"]) {
		return fail("The player is no longer available")
	}
	if db.StringField(playerRow, "ClubId") != toClub {
		return fail("The player has already moved clubs")
	}
	if buyer == nil || floatOf(buyer["Budget"]) < price {
		return fail("The bidding club can no longer afford this")
	}
	if _, err := r.settleTransfer(ctx, db.StringField(offer, "PlayerId"), fromClub, price, "bid accepted (offer "+offerID+")", toClub); err != nil {
		return err
	}
	return r.finishOffer(ctx, offerID, "accepted", "", 0)
}

func (r *Repository) finishOffer(ctx context.Context, offerID, status, note string, counter float64) error {
	var noteVal, counterVal any
	if note != "" {
		noteVal = note
	}
	if counter > 0 {
		counterVal = counter
	}
	_, err := r.q.Exec(ctx, `UPDATE "TransferOffers" SET "Status" = $2, "Note" = $3, "CounterAmount" = $4, "updatedAt" = now() WHERE "_id" = $1`,
		offerID, status, noteVal, counterVal)
	return err
}

// ListOffers returns a club's offers (incoming + outgoing), newest first.
func (r *Repository) ListOffers(ctx context.Context, clubID string, limit, offset int, currentSeasonOnly bool) ([]map[string]any, error) {
	if limit < 1 {
		limit = 40
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	sql := `SELECT * FROM "TransferOffers" WHERE ("FromClubId" = $1 OR "ToClubId" = $1)`
	args := []any{clubID}
	if currentSeasonOnly {
		var minStart *string
		row, ok, err := one(ctx, r.q, `SELECT min("StartDate")::text AS start FROM "Seasons" WHERE "Status" IN ('registration','running')`)
		if err != nil {
			return nil, err
		}
		if ok && row["start"] != nil {
			minStart = strPtr(db.StringField(row, "start"))
		}
		if minStart == nil {
			row2, ok2, err2 := one(ctx, r.q, `SELECT "StartDate"::text AS start FROM "Seasons" ORDER BY "EndDate" DESC LIMIT 1`)
			if err2 != nil {
				return nil, err2
			}
			if ok2 && row2["start"] != nil {
				minStart = strPtr(db.StringField(row2, "start"))
			}
		}
		if minStart != nil {
			args = append(args, *minStart)
			sql += ` AND "createdAt" >= $` + itoa(len(args))
		}
	}
	args = append(args, limit, offset)
	sql += ` ORDER BY "createdAt" DESC LIMIT $` + itoa(len(args)-1) + ` OFFSET $` + itoa(len(args))
	rows, err := all(ctx, r.q, sql, args...)
	if err != nil {
		return nil, err
	}
	return r.toOffers(ctx, clubID, rows)
}

func (r *Repository) toOffers(ctx context.Context, clubID string, rows []map[string]any) ([]map[string]any, error) {
	if len(rows) == 0 {
		return []map[string]any{}, nil
	}
	clubIDs := map[string]bool{}
	playerIDs := map[string]bool{}
	for _, row := range rows {
		clubIDs[db.StringField(row, "FromClubId")] = true
		clubIDs[db.StringField(row, "ToClubId")] = true
		playerIDs[db.StringField(row, "PlayerId")] = true
	}
	clubByID := map[string]map[string]any{}
	if cs, err := all(ctx, r.q, `SELECT "_id","Name","ClubCode" FROM "Clubs" WHERE "_id"::text = ANY($1)`, keys(clubIDs)); err == nil {
		for _, c := range cs {
			clubByID[db.StringField(c, "_id")] = c
		}
	}
	playerByID := map[string]map[string]any{}
	if ps, err := all(ctx, r.q, `SELECT "_id","FirstName","LastName","Position","Rating","Value" FROM "Players" WHERE "_id"::text = ANY($1)`, keys(playerIDs)); err == nil {
		for _, p := range ps {
			playerByID[db.StringField(p, "_id")] = p
		}
	}
	clubRef := func(id string) map[string]any {
		if c := clubByID[id]; c != nil {
			return map[string]any{"id": id, "name": db.StringField(c, "Name"), "code": db.StringField(c, "ClubCode")}
		}
		return map[string]any{"id": id, "name": "?", "code": "?"}
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		status := db.StringField(row, "Status")
		open := status == "pending" || status == "countered"
		responder := db.StringField(row, "ToClubId")
		if status == "countered" {
			responder = db.StringField(row, "FromClubId")
		}
		var awaiting any
		if open {
			if responder == clubID {
				awaiting = "me"
			} else {
				awaiting = "them"
			}
		}
		direction := "outgoing"
		if db.StringField(row, "ToClubId") == clubID {
			direction = "incoming"
		}
		p := playerByID[db.StringField(row, "PlayerId")]
		playerRef := map[string]any{"id": db.StringField(row, "PlayerId"), "name": "Unknown player", "position": nil, "rating": 0, "value": 0}
		if p != nil {
			playerRef = map[string]any{
				"id":       db.StringField(p, "_id"),
				"name":     db.StringField(p, "FirstName") + " " + db.StringField(p, "LastName"),
				"position": p["Position"],
				"rating":   floatOf(p["Rating"]),
				"value":    floatOf(p["Value"]),
			}
		}
		out = append(out, map[string]any{
			"id":            db.StringField(row, "_id"),
			"status":        status,
			"initiator":     db.StringField(row, "Initiator"),
			"amount":        floatOf(row["Amount"]),
			"counterAmount": row["CounterAmount"],
			"note":          row["Note"],
			"createdDay":    intOf(row["CreatedDay"]),
			"expiresDay":    intOf(row["ExpiresDay"]),
			"awaiting":      awaiting,
			"direction":     direction,
			"player":        playerRef,
			"fromClub":      clubRef(db.StringField(row, "FromClubId")),
			"toClub":        clubRef(db.StringField(row, "ToClubId")),
		})
	}
	return out, nil
}

// ScoutedShortlist is the Scouting-Department shortlist (scouted-shortlist.service.ts).
func (r *Repository) ScoutedShortlist(ctx context.Context, clubID string) ([]map[string]any, error) {
	_, ok, err := one(ctx, r.q, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("Club not found")
	}
	reach := 1
	if levelRow, ok, err := one(ctx, r.q, `SELECT "Level" FROM "ClubAssets" WHERE "ClubId" = $1 AND "AssetType" = 'scouting' LIMIT 1`, clubID); err == nil && ok {
		reach = 1 + minInt(intOf(levelRow["Level"]), 4)
	}

	freeAgents, err := all(ctx, r.q, `SELECT * FROM "Players" WHERE "isSigned" = false AND "isRetired" = false AND "Value" > 0 AND "ClubId" IS NULL`)
	if err != nil {
		return nil, err
	}
	listed, err := all(ctx, r.q, `SELECT * FROM "Players" WHERE "isTransferListed" = true AND "ClubId" IS NOT NULL AND "ClubId" <> $1`, clubID)
	if err != nil {
		return nil, err
	}
	candidates := append(freeAgents, listed...)
	score := func(p map[string]any) float64 { return floatOf(p["Rating"]) / (floatOf(p["Value"]) + 1) }
	sortSlice(candidates, func(a, b map[string]any) bool { return score(a) > score(b) })
	if len(candidates) > reach {
		candidates = candidates[:reach]
	}
	out := make([]map[string]any, 0, len(candidates))
	for _, p := range candidates {
		var asking any
		if p["AskingPrice"] != nil {
			asking = floatOf(p["AskingPrice"])
		}
		out = append(out, map[string]any{
			"id":          db.StringField(p, "_id"),
			"name":        db.StringField(p, "FirstName") + " " + db.StringField(p, "LastName"),
			"position":    p["Position"],
			"rating":      floatOf(p["Rating"]),
			"value":       floatOf(p["Value"]),
			"isListed":    boolOf(p["isTransferListed"]),
			"askingPrice": asking,
		})
	}
	return out, nil
}

// --- helpers ---------------------------------------------------------------

func (r *Repository) currentDay(ctx context.Context) (int, error) {
	state, err := r.Window(ctx)
	if err != nil {
		return 0, err
	}
	return state.CurrentDay, nil
}

func (r *Repository) rosterOf(ctx context.Context, clubID string) ([]map[string]any, error) {
	return all(ctx, r.q, `SELECT "_id","Rating" FROM "Players" WHERE "ClubId" = $1 AND "isSigned" = true AND "isRetired" = false`, clubID)
}

func rankInRoster(p map[string]any, roster []map[string]any) int {
	count := 0
	for _, other := range roster {
		if floatOf(other["Rating"]) > floatOf(p["Rating"]) {
			count++
		}
	}
	return count + 1
}

func floatOf(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	default:
		return 0
	}
}

// sellerMatches reports whether the player's current owner equals the expected
// one. expected == nil means "must be a free agent" (empty ClubId).
func sellerMatches(current string, expected any) bool {
	if expected == nil {
		return current == ""
	}
	s, ok := expected.(string)
	if !ok {
		return false
	}
	return current == s
}

func boolOf(v any) bool { b, _ := v.(bool); return b }

func strPtr(s string) *string { return &s }

func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		if k != "" {
			out = append(out, k)
		}
	}
	return out
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func sortSlice(rows []map[string]any, less func(a, b map[string]any) bool) {
	for i := 1; i < len(rows); i++ {
		for j := i; j > 0 && less(rows[j], rows[j-1]); j-- {
			rows[j], rows[j-1] = rows[j-1], rows[j]
		}
	}
}

func itoa(n int) string {
	return fmt.Sprintf("%d", n)
}
