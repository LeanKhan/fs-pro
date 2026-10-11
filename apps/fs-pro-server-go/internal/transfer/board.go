package transfer

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/performance"
)

// RequestBudgetIncrease is POST /api/transfers/budget-request, ported from
// board-budget.service.ts using JevService's calibrated local fallback
// (status COMPROMISE, 60%), so `source` is "local".

func formScore(form map[string]any) float64 {
	recent := []string{}
	if list, ok := form["recent"].([]any); ok {
		for i, v := range list {
			if i >= 5 {
				break
			}
			if s, ok := v.(string); ok {
				recent = append(recent, s)
			}
		}
	}
	if len(recent) == 0 {
		return 0
	}
	w, l := 0, 0
	for _, r := range recent {
		if r == "W" {
			w++
		}
		if r == "L" {
			l++
		}
	}
	return float64(w-l) / 5
}

func round2(x float64) float64 { return math.Round(x*100) / 100 }

func boardStatement(clubName, status string, granted, requested float64, justification, financialHealth, standingDesc string) string {
	grantedStr := villa(granted)
	requestedStr := villa(requested)
	if status == "ACCEPTED" {
		switch justification {
		case "TITLE_CHALLENGE":
			return fmt.Sprintf("The Board of Directors has fully approved your request for %s. Our current %s and healthy financial standing demonstrate that our sporting ambition warrants serious investment. Deliver silverware to the fans.", grantedStr, standingDesc)
		case "REINVEST_PROFITS":
			return fmt.Sprintf("Request approved in full (%s). The club's matchday revenues and commercial returns have outperformed projections, and the Board is delighted to reinvest this surplus into strengthening the first team.", grantedStr)
		case "PROMOTION_PUSH":
			return fmt.Sprintf("The Board endorses your promotion strategy and grants %s. Reaching the top flight is our collective institutional objective; use these resources decisively in the transfer market.", grantedStr)
		default:
			return fmt.Sprintf("The Board acknowledges the squad demands of our competitive schedule and agrees to release %s to reinforce squad depth and quality.", grantedStr)
		}
	}
	if status == "COMPROMISE" {
		return fmt.Sprintf("While the Board cannot sanction the full %s without exposing the club to unnecessary liquidity risks, we recognize your sporting vision. We have agreed to a compromise grant of %s (%d%% of request) for squad investment.", requestedStr, grantedStr, int(math.Round(granted/requested*100)))
	}
	if financialHealth == "OVERLEVERAGED" || financialHealth == "TIGHT_MARGIN" {
		return fmt.Sprintf("The Board has declined your request for %s. Our projected turnover and existing player wage obligations require strict fiscal discipline. We must rely on player sales or internal academy solutions at this stage.", requestedStr)
	}
	return fmt.Sprintf("The Board has deliberated and determined that allocating an additional %s is not prudent at this juncture. Continue to maximize results with our current squad before we reassess transfer capital.", requestedStr)
}

// villa ports @repo/api-contract formatVilla.
func villa(n float64) string {
	v := int64(math.Round(n))
	sign := ""
	if v < 0 {
		sign = "-"
		v = -v
	}
	if v >= 1_000_000 {
		m := strconv.FormatFloat(float64(v)/1_000_000, 'f', 1, 64)
		m = strings.TrimSuffix(m, ".0")
		return sign + "V" + m + "M"
	}
	s := strconv.FormatInt(v, 10)
	if len(s) > 3 {
		var b strings.Builder
		pre := len(s) % 3
		if pre > 0 {
			b.WriteString(s[:pre])
		}
		for i := pre; i < len(s); i += 3 {
			if b.Len() > 0 {
				b.WriteByte(',')
			}
			b.WriteString(s[i : i+3])
		}
		s = b.String()
	}
	return sign + "V" + s
}

// RequestBudgetIncrease runs the board decision and applies any grant.
func (r *Repository) RequestBudgetIncrease(ctx context.Context, clubID string, requestedAmount float64, justification string) (map[string]any, error) {
	club, ok, err := one(ctx, r.q, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("Club not found")
	}
	squad, err := all(ctx, r.q, `SELECT "Wage" FROM "Players" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	annualWageBill := 0.0
	for _, p := range squad {
		annualWageBill += floatOf(p["Wage"])
	}
	finances := mapOf(club["Finances"])
	netMatchdayProfit := math.Max(0, floatOf(finances["totalMatchdayRevenue"])-floatOf(finances["totalMatchdayCosts"]))
	currentBudget := floatOf(club["Budget"])
	wageToBudgetRatio := 1.0
	if currentBudget > 0 {
		wageToBudgetRatio = round2(annualWageBill / currentBudget)
	}

	standingDesc := "competitive campaign"
	perfScore, perfTarget, perfLevel := 0.0, 0.0, 0
	if view, err := performance.GetPerformance(ctx, r.q, clubID, nil); err == nil {
		perfScore = floatOf(view["score"])
		perfTarget = floatOf(view["expected"])
		perfLevel = int(floatOf(view["level"]))
		if floatOf(view["entries"]) == 0 {
			standingDesc = "lack of competitive entries this year"
		} else {
			standingDesc = fmt.Sprintf("performance this year (%d against a target of %d for Level %d)", int(math.Round(perfScore*100)), int(math.Round(perfTarget*100)), perfLevel)
		}
	}

	financialHealth := "MODERATE_SURPLUS"
	switch {
	case netMatchdayProfit > requestedAmount || (currentBudget > 10_000_000 && requestedAmount <= currentBudget*0.3):
		financialHealth = "STRONG_PROFIT"
	case wageToBudgetRatio > 1.2 || (currentBudget < 500_000 && requestedAmount > 2_000_000):
		financialHealth = "OVERLEVERAGED"
	case requestedAmount > currentBudget*0.8:
		financialHealth = "TIGHT_MARGIN"
	}

	// JevService local fallback: COMPROMISE at 60% (the engine is unavailable).
	status := "COMPROMISE"
	percentage := 60
	boardConfidence := int(floatOf(club["BoardConfidence"]))
	fs := formScore(mapOf(club["Form"]))
	confidenceCap := 100
	if boardConfidence < 20 {
		confidenceCap = 0
	} else if boardConfidence < 35 {
		confidenceCap = 50
	} else if fs < -0.4 {
		confidenceCap = 75
	}
	if percentage > confidenceCap {
		percentage = confidenceCap
		if percentage == 0 {
			status = "REJECTED"
		} else {
			status = "COMPROMISE"
		}
	}
	lostFaith := confidenceCap == 0
	grantedAmount := math.Round(requestedAmount * float64(percentage) / 100)
	newBudget := currentBudget + grantedAmount
	confidence := 88

	statement := ""
	if lostFaith {
		statement = fmt.Sprintf("The Board has declined your request for %s. Confidence in the current direction is at a low ebb after recent results; there will be no further investment until performances improve.", villa(requestedAmount))
	} else {
		statement = boardStatement(db.StringField(club, "Name"), status, grantedAmount, requestedAmount, justification, financialHealth, standingDesc)
	}

	if grantedAmount > 0 {
		err = db.WithTx(ctx, r.q, func(tx db.Querier) error {
			if _, err := db.InsertRow(ctx, tx, "TransferLedger", map[string]any{
				"Type": "board_grant", "BuyerClubId": clubID, "Amount": grantedAmount,
				"Note": fmt.Sprintf("Board Budget Grant (%s): %s", status, sliceRunes(statement, 200)), "updatedAt": time.Now(),
			}); err != nil {
				return err
			}
			nextFinances := map[string]any{}
			for k, v := range finances {
				nextFinances[k] = v
			}
			nextFinances["lastBudgetGrant"] = map[string]any{
				"date": time.Now(), "status": status, "requestedAmount": requestedAmount,
				"grantedAmount": grantedAmount, "justification": justification,
			}
			_, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) + $2, "Finances" = $3, "updatedAt" = now() WHERE "_id" = $1`,
				clubID, grantedAmount, nextFinances)
			return err
		})
		if err != nil {
			return nil, err
		}
	}

	return map[string]any{
		"status":          status,
		"requestedAmount": requestedAmount,
		"grantedAmount":   grantedAmount,
		"newBudget":       newBudget,
		"boardStatement":  statement,
		"confidence":      confidence,
		"financialContext": map[string]any{
			"currentBudget":     currentBudget,
			"netMatchdayProfit": netMatchdayProfit,
			"annualWageBill":    annualWageBill,
			"wageToBudgetRatio": wageToBudgetRatio,
		},
		"source": "local",
	}, nil
}

func sliceRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
