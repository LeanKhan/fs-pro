package transfer

import (
	"context"
	"fmt"
	"math"
	"time"

	"fs-pro-server/internal/db"
)

// Ports of transfer-scout.service.ts, board-budget.service.ts and the
// listPlayerForSale flow in transfer-market.service.ts, using JevService's
// calibrated local fallback (the engine is not reachable from the Go server),
// so `source` is always "local".

const maxSquadSize = 20

func mapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// improvesSquad ports improvesSquad: true when the target beats the median
// rating at their position (or there are fewer than two at that position).
func improvesSquad(playerRating float64, playerPosition string, roster []map[string]any) bool {
	ratings := []float64{}
	for _, p := range roster {
		if db.StringField(p, "Position") == playerPosition {
			ratings = append(ratings, math.Round(floatOf(p["Rating"])))
		}
	}
	if len(ratings) < 2 {
		return true
	}
	for i := 1; i < len(ratings); i++ {
		for j := i; j > 0 && ratings[j] < ratings[j-1]; j-- {
			ratings[j], ratings[j-1] = ratings[j-1], ratings[j]
		}
	}
	return playerRating > ratings[len(ratings)/2]
}

// listingReaction is JevService.generatePlayerListingReaction's local fallback.
func listingReaction(age, rating, value, askingPrice float64, isYouth bool) (string, string, string) {
	youth := isYouth || age <= 20
	isKeyPlayer := rating >= 78
	priceRatio := 1.0
	if value > 0 {
		priceRatio = askingPrice / value
	}
	sentiment := "accepts_professionally"
	switch {
	case youth:
		sentiment = "youth_breakout_eager"
	case isKeyPlayer && priceRatio < 0.95:
		sentiment = "unhappy_demoralized"
	case isKeyPlayer:
		sentiment = "unhappy_demoralized"
	case age >= 30:
		sentiment = "accepts_professionally"
	}
	quote := ""
	morale := "Content"
	switch sentiment {
	case "youth_breakout_eager":
		quote = "I've worked hard in the academy and I'm hungry for senior minutes. If the opportunity is elsewhere, I'm ready to make my mark."
		morale = "Very High"
	case "unhappy_demoralized":
		quote = "I've put my heart into this squad. Being put in the shop window feels like a lack of faith, but I have to look out for my future."
		morale = "Low"
	case "ambitious_eager":
		quote = "I appreciate everything here, but I'm excited by the prospect of a new challenge and testing myself at another club."
		morale = "High"
	case "determined_to_fight":
		quote = "The manager might have listed me, but every day in training I'll be working to show I still have a major role to play here."
		morale = "Determined"
	default:
		quote = "The manager was upfront about the club needing to raise funds. Football is a business, and I'll remain completely professional until a deal happens."
		morale = "Content"
	}
	return sentiment, quote, morale
}

// ListPlayerForSale is POST /api/transfers/list.
func (r *Repository) ListPlayerForSale(ctx context.Context, playerID, clubID string, isListed bool, askingPrice *float64) (map[string]any, error) {
	player, ok, err := one(ctx, r.q, `SELECT * FROM "Players" WHERE "_id" = $1 LIMIT 1`, playerID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("Player not found")
	}
	if db.StringField(player, "ClubId") != clubID {
		return nil, fmt.Errorf("This player does not belong to your club")
	}
	club, _, err := one(ctx, r.q, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	clubName := "your club"
	if club != nil && db.StringField(club, "Name") != "" {
		clubName = db.StringField(club, "Name")
	}

	if !isListed {
		updated, err := updatePlayerListing(ctx, r.q, playerID, false, nil, "")
		if err != nil {
			return nil, err
		}
		morale := db.StringField(updated, "Morale")
		if morale == "" {
			morale = "Content"
		}
		return map[string]any{
			"player":         updated,
			"reaction":       map[string]any{"sentiment": "reassured", "quote": "I'm relieved the speculation is over and I can focus entirely on playing for this club.", "morale": morale},
			"marketInterest": "Player removed from the transfer list.",
			"newOffer":       nil,
		}, nil
	}

	baseVal := floatOf(player["Value"])
	if baseVal == 0 {
		baseVal = 100000
	}
	finalAskingPrice := baseVal
	if askingPrice != nil && *askingPrice > 0 {
		finalAskingPrice = *askingPrice
	}
	firstName := db.StringField(player, "FirstName")
	lastName := db.StringField(player, "LastName")
	age := floatOf(player["Age"])
	if age == 0 {
		age = 24
	}
	rating := floatOf(player["Rating"])
	if rating == 0 {
		rating = 65
	}
	isYouth := boolOf(player["isYouth"]) || (age > 0 && age <= 20)
	sentiment, quote, morale := listingReaction(age, rating, baseVal, finalAskingPrice, isYouth)

	updated, err := updatePlayerListing(ctx, r.q, playerID, true, &finalAskingPrice, morale)
	if err != nil {
		return nil, err
	}
	_ = sentiment
	reaction := map[string]any{"sentiment": sentiment, "quote": quote, "morale": morale}

	var newOffer any
	marketInterest := "Moderate interest from domestic scouts."
	window, err := r.Window(ctx)
	if err != nil {
		return nil, err
	}
	if window.Open {
		aiClubs, err := all(ctx, r.q, `SELECT * FROM "Clubs" WHERE "UserId" IS NULL`)
		if err != nil {
			return nil, err
		}
		targetRating := floatOf(updated["Rating"])
		targetPosition := db.StringField(updated, "Position")
		var bidder map[string]any
		count := 0
		for _, c := range aiClubs {
			roster, err := r.rosterOf(ctx, db.StringField(c, "_id"))
			if err != nil {
				return nil, err
			}
			budget := floatOf(c["Budget"])
			if len(roster) >= maxSquadSize {
				continue
			}
			if budget < finalAskingPrice*0.9 {
				continue
			}
			if !improvesSquad(targetRating, targetPosition, roster) {
				continue
			}
			count++
			if bidder == nil {
				bidder = c
			}
		}
		if bidder != nil {
			marketInterest = fmt.Sprintf("High interest: %d club(s) are actively tracking %s.", count, firstName)
			bidAmount := math.Round(math.Min(finalAskingPrice, floatOf(bidder["Budget"])*0.9))
			day, err := r.currentDay(ctx)
			if err != nil {
				return nil, err
			}
			note := "Opening bid for transfer-listed target"
			if boolOf(updated["isYouth"]) {
				note = "Opening bid for promising youth prospect"
			}
			offer, err := db.InsertRow(ctx, r.q, "TransferOffers", map[string]any{
				"PlayerId": playerID, "FromClubId": db.StringField(bidder, "_id"), "ToClubId": clubID,
				"Amount": bidAmount, "Status": "pending", "Initiator": "ai", "Note": note,
				"CreatedDay": day, "ExpiresDay": day + offerLifetimeDays, "updatedAt": time.Now(),
			})
			if err != nil {
				return nil, err
			}
			newOffer = map[string]any{
				"id": db.StringField(offer, "_id"), "status": "pending", "initiator": "ai",
				"amount": bidAmount, "counterAmount": nil, "note": note,
				"createdDay": day, "expiresDay": day + offerLifetimeDays, "awaiting": "me", "direction": "incoming",
				"player": map[string]any{
					"id": playerID, "name": firstName + " " + lastName,
					"position": db.StringField(updated, "Position"), "rating": floatOf(updated["Rating"]), "value": floatOf(updated["Value"]),
				},
				"fromClub": map[string]any{"id": db.StringField(bidder, "_id"), "name": db.StringField(bidder, "Name"), "code": db.StringField(bidder, "ClubCode")},
				"toClub":   map[string]any{"id": clubID, "name": clubName, "code": db.StringField(club, "ClubCode")},
			}
		} else {
			marketInterest = "Scouts have noted the listing. Clubs are reviewing their wage budgets."
		}
	} else {
		marketInterest = "Transfer window is closed. Enquiries will begin once the window opens."
	}

	return map[string]any{
		"player":         updated,
		"reaction":       reaction,
		"marketInterest": marketInterest,
		"newOffer":       newOffer,
	}, nil
}

func updatePlayerListing(ctx context.Context, q db.Querier, playerID string, listed bool, asking *float64, morale string) (map[string]any, error) {
	var askingVal any
	if listed && asking != nil {
		askingVal = *asking
	}
	var moraleVal any
	if morale != "" {
		moraleVal = morale
	}
	rows, err := q.Query(ctx, `UPDATE "Players" SET "isTransferListed" = $2, "AskingPrice" = $3,
		"Morale" = COALESCE($4, "Morale"), "updatedAt" = now() WHERE "_id" = $1 RETURNING *`, playerID, listed, askingVal, moraleVal)
	if err != nil {
		return nil, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("Player not found")
	}
	return m, nil
}
