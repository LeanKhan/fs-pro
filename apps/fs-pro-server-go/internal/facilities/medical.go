package facilities

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"fs-pro-server/internal/db"
)

// Medical Centre, ported from
// apps/fs-pro-server/src/services/facilities/medical.service.ts.

const (
	squadRecoveryBaseCost  = 20_000.0
	rehabBaseCost          = 16_000.0
	hyperbaricBaseCost     = 9_000.0
	surgeryBaseCost        = 45_000.0
	squadRecoveryCooldownS = 900
)

// TreatmentCosts is the four treatment prices after a facility discount.
type TreatmentCosts struct {
	SquadRecovery float64 `json:"squadRecovery"`
	Rehab         float64 `json:"rehab"`
	Hyperbaric    float64 `json:"hyperbaric"`
	Surgery       float64 `json:"surgery"`
}

// CalculateTreatmentCosts ports calculateTreatmentCosts (discount capped 0..0.5).
func CalculateTreatmentCosts(discount float64) TreatmentCosts {
	d := math.Min(math.Max(discount, 0), 0.5)
	factor := 1 - d
	return TreatmentCosts{
		SquadRecovery: math.Round(squadRecoveryBaseCost * factor),
		Rehab:         math.Round(rehabBaseCost * factor),
		Hyperbaric:    math.Round(hyperbaricBaseCost * factor),
		Surgery:       math.Round(surgeryBaseCost * factor),
	}
}

// formatVilla ports @repo/api-contract formatVilla.
func formatVilla(n float64) string {
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
	return sign + "V" + withCommas(v)
}

func withCommas(v int64) string {
	s := strconv.FormatInt(v, 10)
	if len(s) <= 3 {
		return s
	}
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
	return b.String()
}

// medicalEffects reads the Medical Centre level and its effect map.
func (r *Repository) medicalEffects(ctx context.Context, clubID string) (map[string]float64, error) {
	rows, err := r.q.Query(ctx, `SELECT "Level" FROM "ClubAssets" WHERE "ClubId" = $1 AND "AssetType" = 'medical_centre' LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	level := 0
	if m, ok, err := db.ScanOne(rows); err != nil {
		return nil, err
	} else if ok {
		level = intOf(m["Level"])
	}
	return Effects(MedicalCentre, level), nil
}

type medPlayer struct {
	id        string
	firstName string
	lastName  string
	position  string
	age       any
	rating    any
	fitness   float64
	injury    map[string]any
	hasInjury bool
}

func (p medPlayer) summary(injury any) map[string]any {
	return map[string]any{
		"id":       p.id,
		"name":     p.firstName + " " + p.lastName,
		"position": nullableStr(p.position, "SUB"),
		"age":      p.age,
		"rating":   p.rating,
		"fitness":  math.Round(p.fitness),
		"injury":   injury,
	}
}

func nullableStr(s, fallback string) any {
	if s == "" {
		return fallback
	}
	return s
}

func (r *Repository) squad(ctx context.Context, clubID string) ([]medPlayer, error) {
	rows, err := r.q.Query(ctx, `SELECT "_id","FirstName","LastName","Position","Age","Rating","Fitness","Injury"
		FROM "Players" WHERE "ClubId" = $1 AND "isRetired" = false`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make([]medPlayer, 0, len(list))
	for _, m := range list {
		injury := mapOf(m["Injury"])
		days := 0
		if injury != nil {
			days = intOf(injury["daysRemaining"])
		}
		out = append(out, medPlayer{
			id: db.StringField(m, "_id"), firstName: db.StringField(m, "FirstName"),
			lastName: db.StringField(m, "LastName"), position: db.StringField(m, "Position"),
			age: m["Age"], rating: m["Rating"], fitness: floatOr(m["Fitness"], 100),
			injury: injury, hasInjury: days > 0,
		})
	}
	return out, nil
}

func mapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func floatOr(v any, fallback float64) float64 {
	if v == nil {
		return fallback
	}
	return floatOf(v)
}

// MedicalStatus is GET /api/facilities/{clubId}/medical.
func (r *Repository) MedicalStatus(ctx context.Context, clubID string) (map[string]any, bool, error) {
	club, ok, err := r.Club(ctx, clubID)
	if err != nil || !ok {
		return nil, ok, err
	}
	_ = club
	effects, err := r.medicalEffects(ctx, clubID)
	if err != nil {
		return nil, false, err
	}
	facilityLevel := effects["medicalLevel"]
	treatmentBays := effects["treatmentBays"]
	if treatmentBays == 0 {
		treatmentBays = 1
	}
	discount := effects["treatmentDiscount"]
	cooldownMultiplier := effects["cooldownMultiplier"]
	if cooldownMultiplier == 0 {
		cooldownMultiplier = 1
	}
	costs := CalculateTreatmentCosts(discount)

	cooldownPeriod := math.Round(squadRecoveryCooldownS * cooldownMultiplier)
	available := true
	cooldownSeconds := 0
	rows, err := r.q.Query(ctx, `SELECT "createdAt" FROM "TransferLedger"
		WHERE "BuyerClubId" = $1 AND "Type" = 'medical_treatment' AND "Note" = 'Squad Cryotherapy Session'
		ORDER BY "createdAt" DESC LIMIT 1`, clubID)
	if err != nil {
		return nil, false, err
	}
	if last, ok, err := db.ScanOne(rows); err != nil {
		return nil, false, err
	} else if ok && last["createdAt"] != nil {
		if t, err := time.Parse("2006-01-02T15:04:05.000Z", db.StringField(last, "createdAt")); err == nil {
			elapsed := time.Since(t).Seconds()
			if elapsed < cooldownPeriod {
				available = false
				cooldownSeconds = int(math.Ceil(cooldownPeriod - elapsed))
			}
		}
	}

	squad, err := r.squad(ctx, clubID)
	if err != nil {
		return nil, false, err
	}
	injured := make([]any, 0)
	fatigued := []medPlayer{}
	for _, p := range squad {
		if p.hasInjury {
			injured = append(injured, p.summary(map[string]any{"type": db.StringField(p.injury, "type"), "daysRemaining": intOf(p.injury["daysRemaining"])}))
		} else if p.fitness < 85 {
			fatigued = append(fatigued, p)
		}
	}
	for i := 1; i < len(fatigued); i++ {
		for j := i; j > 0 && fatigued[j].fitness < fatigued[j-1].fitness; j-- {
			fatigued[j], fatigued[j-1] = fatigued[j-1], fatigued[j]
		}
	}
	fatiguedOut := make([]any, 0, len(fatigued))
	for _, p := range fatigued {
		fatiguedOut = append(fatiguedOut, p.summary(nil))
	}

	return map[string]any{
		"facilityLevel": facilityLevel,
		"treatmentBays": treatmentBays,
		"baysAvailable": treatmentBays,
		"squadRecovery": map[string]any{
			"available":       available,
			"cooldownSeconds": cooldownSeconds,
			"cost":            costs.SquadRecovery,
		},
		"costs": map[string]any{
			"squadRecovery": costs.SquadRecovery,
			"rehab":         costs.Rehab,
			"hyperbaric":    costs.Hyperbaric,
			"surgery":       costs.Surgery,
		},
		"injuredPlayers":  injured,
		"fatiguedPlayers": fatiguedOut,
	}, true, nil
}

// SquadRecovery is POST /api/facilities/{clubId}/medical/squad-recovery.
func (r *Repository) SquadRecovery(ctx context.Context, clubID string) (map[string]any, error) {
	club, ok, err := r.Club(ctx, clubID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("Club not found")
	}
	effects, err := r.medicalEffects(ctx, clubID)
	if err != nil {
		return nil, err
	}
	cost := CalculateTreatmentCosts(effects["treatmentDiscount"]).SquadRecovery
	currentBudget := floatOf(club["Budget"])
	if currentBudget < cost {
		return nil, insuffBudget("Squad Cryotherapy", cost)
	}

	remaining := currentBudget - cost
	err = db.WithTx(ctx, r.q, func(tx db.Querier) error {
		rows, err := tx.Query(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) - $2, "updatedAt" = now()
			WHERE "_id" = $1 AND coalesce("Budget",0) >= $2 RETURNING "Budget"`, clubID, cost)
		if err != nil {
			return err
		}
		updated, ok, err := db.ScanOne(rows)
		if err != nil {
			return err
		}
		if !ok {
			return insuffBudget("Squad Cryotherapy", cost)
		}
		remaining = floatOf(updated["Budget"])
		if _, err := db.InsertRow(ctx, tx, "TransferLedger", map[string]any{
			"Type": "medical_treatment", "BuyerClubId": clubID, "Amount": cost,
			"Note": "Squad Cryotherapy Session", "updatedAt": time.Now(),
		}); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE "Players"
			SET "Fitness" = LEAST(100, COALESCE("Fitness", 100) + 30),
			    "Injury" = CASE
			      WHEN "Injury" IS NOT NULL AND ("Injury"->>'daysRemaining')::int <= 1 THEN NULL
			      WHEN "Injury" IS NOT NULL THEN jsonb_set("Injury", '{daysRemaining}', to_jsonb(("Injury"->>'daysRemaining')::int - 1))
			      ELSE "Injury"
			    END
			WHERE "ClubId" = $1::uuid AND "isRetired" = false`, clubID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"success":          true,
		"message":          "Squad Cryotherapy complete! All players recovered +30 Fitness and -1 injury day.",
		"cost":             cost,
		"playersRecovered": 1,
		"remainingBudget":  remaining,
	}, nil
}

func insuffBudget(label string, cost float64) error {
	return fmt.Errorf("Insufficient budget for %s (%s required)", label, formatVilla(cost))
}

// TreatPlayer is POST /api/facilities/{clubId}/medical/treat-player.
func (r *Repository) TreatPlayer(ctx context.Context, clubID, playerID, treatmentType string) (map[string]any, error) {
	club, ok, err := r.Club(ctx, clubID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("Club not found")
	}
	players, err := r.squad(ctx, clubID)
	if err != nil {
		return nil, err
	}
	var player *medPlayer
	for i := range players {
		if players[i].id == playerID {
			player = &players[i]
			break
		}
	}
	if player == nil {
		return nil, fmt.Errorf("Player not found in your club roster")
	}
	effects, err := r.medicalEffects(ctx, clubID)
	if err != nil {
		return nil, err
	}
	facilityLevel := int(effects["medicalLevel"])
	costs := CalculateTreatmentCosts(effects["treatmentDiscount"])

	var cost float64
	var actionLabel, outcome string
	switch treatmentType {
	case "rehab":
		cost = costs.Rehab
		actionLabel = "Intensive Physio & Rehab"
		if !player.hasInjury {
			return nil, fmt.Errorf("%s %s does not have an active injury", player.firstName, player.lastName)
		}
	case "hyperbaric":
		cost = costs.Hyperbaric
		actionLabel = "Hyperbaric Oxygen Boost"
	case "surgery":
		if facilityLevel < 3 {
			return nil, fmt.Errorf("Specialist Surgery requires Medical Centre Level 3 or higher")
		}
		cost = costs.Surgery
		actionLabel = "Specialist Surgery"
		if !player.hasInjury {
			return nil, fmt.Errorf("%s %s does not have an active injury to operate on", player.firstName, player.lastName)
		}
	default:
		return nil, fmt.Errorf("Unknown treatment type")
	}

	currentBudget := floatOf(club["Budget"])
	if currentBudget < cost {
		return nil, insuffBudget(actionLabel, cost)
	}

	var summary map[string]any
	remaining := currentBudget - cost
	err = db.WithTx(ctx, r.q, func(tx db.Querier) error {
		rows, err := tx.Query(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) - $2, "updatedAt" = now()
			WHERE "_id" = $1 AND coalesce("Budget",0) >= $2 RETURNING "Budget"`, clubID, cost)
		if err != nil {
			return err
		}
		updated, ok, err := db.ScanOne(rows)
		if err != nil {
			return err
		}
		if !ok {
			return insuffBudget(actionLabel, cost)
		}
		remaining = floatOf(updated["Budget"])
		if _, err := db.InsertRow(ctx, tx, "TransferLedger", map[string]any{
			"Type": "medical_treatment", "BuyerClubId": clubID, "PlayerId": playerID,
			"Amount": cost, "Note": fmt.Sprintf("%s: %s %s", actionLabel, player.firstName, player.lastName),
			"updatedAt": time.Now(),
		}); err != nil {
			return err
		}

		switch treatmentType {
		case "rehab":
			cut := 2 + facilityLevel
			if cut < 2 {
				cut = 2
			}
			curDays := intOf(player.injury["daysRemaining"])
			if curDays <= cut {
				if _, err := tx.Exec(ctx, `UPDATE "Players" SET "Injury" = NULL, "Fitness" = GREATEST(COALESCE("Fitness",100),85) WHERE "_id" = $1`, playerID); err != nil {
					return err
				}
				outcome = fmt.Sprintf("Full recovery! %s %s is cured of %s and match-ready.", player.firstName, player.lastName, db.StringField(player.injury, "type"))
			} else {
				remainingDays := curDays - cut
				if _, err := tx.Exec(ctx, `UPDATE "Players" SET "Injury" = jsonb_set("Injury", '{daysRemaining}', to_jsonb($2::int)) WHERE "_id" = $1`, playerID, remainingDays); err != nil {
					return err
				}
				outcome = fmt.Sprintf("Intensive Rehab shaved %d days off %s's recovery (%d days remaining).", cut, player.firstName, remainingDays)
			}
		case "hyperbaric":
			if _, err := tx.Exec(ctx, `UPDATE "Players" SET "Fitness" = 100 WHERE "_id" = $1`, playerID); err != nil {
				return err
			}
			outcome = fmt.Sprintf("%s %s conditioned in the Hyperbaric chamber to 100%% Fitness!", player.firstName, player.lastName)
		case "surgery":
			if _, err := tx.Exec(ctx, `UPDATE "Players" SET "Injury" = NULL, "Fitness" = 80 WHERE "_id" = $1`, playerID); err != nil {
				return err
			}
			outcome = fmt.Sprintf("Specialist Surgery successful! %s %s's injury is completely healed.", player.firstName, player.lastName)
		}

		updatedPalyer, err := onePlayerAt(ctx, tx, playerID)
		if err != nil {
			return err
		}
		summary = updatedPalyer.summary(injuryOrNil(updatedPalyer))
		return nil
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"success":         true,
		"message":         outcome,
		"cost":            cost,
		"remainingBudget": remaining,
		"player":          summary,
	}, nil
}

func injuryOrNil(p medPlayer) any {
	if !p.hasInjury {
		return nil
	}
	return map[string]any{"type": db.StringField(p.injury, "type"), "daysRemaining": intOf(p.injury["daysRemaining"])}
}

func onePlayerAt(ctx context.Context, q db.Querier, playerID string) (medPlayer, error) {
	rows, err := q.Query(ctx, `SELECT "_id","FirstName","LastName","Position","Age","Rating","Fitness","Injury" FROM "Players" WHERE "_id" = $1 LIMIT 1`, playerID)
	if err != nil {
		return medPlayer{}, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil {
		return medPlayer{}, err
	}
	if !ok {
		return medPlayer{}, fmt.Errorf("Player not found")
	}
	injury := mapOf(m["Injury"])
	days := 0
	if injury != nil {
		days = intOf(injury["daysRemaining"])
	}
	return medPlayer{
		id: db.StringField(m, "_id"), firstName: db.StringField(m, "FirstName"),
		lastName: db.StringField(m, "LastName"), position: db.StringField(m, "Position"),
		age: m["Age"], rating: m["Rating"], fitness: floatOr(m["Fitness"], 100),
		injury: injury, hasInjury: days > 0,
	}, nil
}
