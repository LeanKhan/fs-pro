package transfer

import (
	"context"
	"fmt"
	"math"
	"strings"

	"fs-pro-server/internal/db"
)

// ScoutPlayerTransfer is POST /api/transfers/scout, ported from
// transfer-scout.service.ts using JevService's local fallback (source "local").

func verdictRecommendation(delta, budgetShare, age float64) (string, float64) {
	switch {
	case delta >= 3 && budgetShare <= 60:
		return "MUST_BUY", 0.70
	case delta >= 0 && budgetShare <= 80:
		return "RECOMMENDED", 0.65
	case budgetShare > 95 || age > 33:
		return "HIGH_RISK", 0.55
	default:
		return "ROTATION", 0.58
	}
}

func verdictText(name, recommendation string, ratingDelta int, currentBest any) string {
	switch recommendation {
	case "MUST_BUY":
		if currentBest != nil && ratingDelta > 0 {
			return fmt.Sprintf("High-priority target: %s is an immediate +%d OVR upgrade for your starting lineup with elite tactical value.", name, ratingDelta)
		}
		return fmt.Sprintf("High-priority target: %s offers premier quality and exceptional squad impact at this price point.", name)
	case "RECOMMENDED":
		return fmt.Sprintf("Solid acquisition: %s provides reliable starting quality and technical balance at a sensible market valuation.", name)
	case "ROTATION":
		return fmt.Sprintf("Useful squad depth: %s will strengthen bench options and rotation during tight matchday schedules.", name)
	case "OVERPRICED":
		return fmt.Sprintf("Valuation alert: While %s possesses talent, the requested transfer fee and wage demand exceed market efficiency for this position.", name)
	case "HIGH_RISK":
		return "Caution advised: High financial burden or age profile makes this transfer a significant gamble relative to current squad requirements."
	default:
		return fmt.Sprintf("%s is currently scouted as a viable transfer candidate.", name)
	}
}

func tacticalText(lastName, style string, attrs map[string]any) string {
	s := strings.ToLower(style)
	attr := func(k string) float64 {
		if v, ok := attrs[k]; ok && v != nil {
			return floatOf(v)
		}
		return 50
	}
	switch {
	case strings.Contains(s, "press"):
		return fmt.Sprintf("In your High Press system, %s's stamina (%v) and pace (%v) provide the physical engine needed to disrupt opposition build-up.", lastName, attr("Stamina"), attr("Speed"))
	case strings.Contains(s, "possession"):
		return fmt.Sprintf("In your Possession structure, %s's passing (%v) and ball control (%v) ensure fluid distribution and tempo control.", lastName, attr("ShortPass"), attr("Control"))
	case strings.Contains(s, "block"):
		marking := attrs["Marking"]
		if marking == nil {
			marking = attrs["Positioning"]
		}
		if marking == nil {
			marking = 50
		}
		return fmt.Sprintf("In your Low Block defensive shape, %s's tackling (%v) and marking (%v) strengthen defensive compactness.", lastName, attr("Tackling"), floatOf(marking))
	case strings.Contains(s, "direct"):
		return fmt.Sprintf("In your Direct setup, %s's speed (%v) and finishing (%v) facilitate rapid counter-attacking transitions.", lastName, attr("Speed"), attr("Shooting"))
	default:
		return fmt.Sprintf("Balanced profile: %s adapts comfortably to your tactical instructions with no glaring structural trade-offs.", lastName)
	}
}

func financialText(isFreeAgent bool, budget, valuation float64) string {
	pct := 100
	if budget > 0 {
		pct = int(math.Round(valuation / budget * 100))
	}
	if isFreeAgent {
		return "Free Agent: Zero transfer fee required. Requires only annual wage commitment, making this an ultra-cost-effective signing."
	}
	if pct <= 25 {
		return fmt.Sprintf("Minor financial impact: Fee represents only %d%% of your available transfer budget, leaving ample flexibility for other moves.", pct)
	}
	if pct <= 60 {
		return fmt.Sprintf("Moderate investment: Fee consumes %d%% of available transfer funds with sustainable wage impact.", pct)
	}
	return fmt.Sprintf("Major financial commitment: Consumes %d%% of your current transfer budget. Careful wage management advised.", pct)
}

func roleText(position, roleLevel string, delta, samePosCount int, age float64, lastName string) string {
	switch roleLevel {
	case "STARTER_UPGRADE":
		return fmt.Sprintf("Starting XI Upgrade: Projected first-choice %s, immediately boosting lineup strength by +%d OVR.", position, maxInt(1, delta))
	case "FUTURE_PROSPECT":
		return fmt.Sprintf("Future Prospect: Young talent (Age %v) with significant developmental upside and long-term resale potential.", age)
	case "KEY_DEPTH":
		return fmt.Sprintf("Key Squad Cover: Competes for a starting berth alongside %d current %ss and provides matchday security.", samePosCount, position)
	default:
		return "Squad Depth: Provides secondary coverage across rotational fixtures."
	}
}

// ScoutPlayerTransfer builds the deep scouting report.
func (r *Repository) ScoutPlayerTransfer(ctx context.Context, playerID, clubID string) (map[string]any, error) {
	player, ok, err := one(ctx, r.q, `SELECT * FROM "Players" WHERE "_id" = $1 LIMIT 1`, playerID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("Player not found")
	}
	club, cok, err := one(ctx, r.q, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	if !cok {
		return nil, fmt.Errorf("Club not found")
	}
	squad, err := all(ctx, r.q, `SELECT * FROM "Players" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return nil, err
	}

	position := db.StringField(player, "Position")
	samePos := []map[string]any{}
	for _, p := range squad {
		if db.StringField(p, "Position") == position {
			samePos = append(samePos, p)
		}
	}
	var currentBest any
	ratingDelta := 0
	if len(samePos) > 0 {
		best := math.Inf(-1)
		for _, p := range samePos {
			if v := math.Round(floatOf(p["Rating"])); v > best {
				best = v
			}
		}
		currentBest = int(best)
		ratingDelta = int(math.Round(floatOf(player["Rating"])) - best)
	}
	style := "Balanced"
	if t := mapOf(club["Tactic"]); t != nil {
		if v := db.StringField(t, "styleName"); v != "" {
			style = v
		}
	}
	budget := floatOf(club["Budget"])
	valuation := floatOf(player["Value"])
	budgetShare := 100.0
	if budget > 0 {
		budgetShare = math.Round(valuation / budget * 100)
	}
	age := floatOf(player["Age"])
	if age == 0 {
		age = 25
	}
	attrs := mapOf(player["Attributes"])

	recommendation, verdictConf := verdictRecommendation(float64(ratingDelta), budgetShare, age)
	tacticalFitLevel := "EXCELLENT"
	squadRoleLevel := "KEY_DEPTH"
	if ratingDelta > 0 {
		squadRoleLevel = "STARTER_UPGRADE"
	} else if age <= 21 {
		squadRoleLevel = "FUTURE_PROSPECT"
	}
	confidence := int(math.Round(verdictConf * 100))
	dealRating := 75
	switch recommendation {
	case "MUST_BUY":
		dealRating = minInt(98, 88+int(math.Round(float64(confidence)*0.1)))
	case "RECOMMENDED":
		dealRating = minInt(86, 75+int(math.Round(float64(confidence)*0.1)))
	case "ROTATION":
		dealRating = 65
	case "OVERPRICED":
		dealRating = 48
	case "HIGH_RISK":
		dealRating = 35
	}
	name := db.StringField(player, "FirstName") + " " + db.StringField(player, "LastName")

	return map[string]any{
		"player":              player,
		"recommendation":      recommendation,
		"dealRating":          dealRating,
		"confidence":          confidence,
		"verdict":             verdictText(name, recommendation, ratingDelta, currentBest),
		"tacticalFit":         tacticalText(db.StringField(player, "LastName"), style, attrs),
		"tacticalFitLevel":    tacticalFitLevel,
		"financialAssessment": financialText(db.StringField(player, "ClubId") == "", budget, valuation),
		"squadRole":           roleText(position, squadRoleLevel, ratingDelta, len(samePos), age, db.StringField(player, "LastName")),
		"squadRoleLevel":      squadRoleLevel,
		"comparisonWithSquad": map[string]any{
			"currentBestRating": currentBest,
			"ratingDelta":       ratingDelta,
			"samePositionCount": len(samePos),
		},
		"source": "local",
	}, nil
}
