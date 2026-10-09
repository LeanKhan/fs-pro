package program

import (
	"context"
	"fmt"
	"math"

	"fs-pro-server/internal/club"
	"fs-pro-server/internal/db"
)

// Manager-model arithmetic, ported from manager-model.ts.
const (
	interviewFee     = 25000
	scoutFee         = 15000
	negotiationBonus = 0.1
	hiddenSpread     = 6
	attrMin          = 40
	attrMax          = 90
	maxManagerPool   = 200
	maxPlayerPool    = 300
	legalSquad       = 11
)

// MaskRange is the hidden-attribute range shown before a paid reveal.
func MaskRange(value, spread, min, max int) (int, int) {
	low := int(math.Max(float64(min), math.Round(float64(value))-float64(spread)))
	high := int(math.Min(float64(max), math.Round(float64(value))+float64(spread)))
	return low, high
}

// ManagerOverall is the weighted overall.
func ManagerOverall(tactics, motivation, development, discipline int) int {
	return int(math.Round(0.4*float64(tactics) + 0.2*float64(motivation) + 0.25*float64(development) + 0.15*float64(discipline)))
}

// ManagerFee is the signing fee for an overall.
func ManagerFee(overall int) int {
	switch {
	case overall >= 75:
		return 2000000
	case overall >= 70:
		return 1100000
	case overall >= 65:
		return 650000
	case overall >= 60:
		return 360000
	case overall >= 55:
		return 180000
	case overall >= 50:
		return 90000
	default:
		return 40000
	}
}

// ManagerWage is the per-Year wage for an overall.
func ManagerWage(overall int) int {
	switch {
	case overall >= 75:
		return 100000
	case overall >= 70:
		return 55000
	case overall >= 65:
		return 32500
	case overall >= 60:
		return 18000
	case overall >= 55:
		return 9000
	case overall >= 50:
		return 4500
	default:
		return 2000
	}
}

// EffectiveManagerFee applies the 10% interview negotiation.
func EffectiveManagerFee(signingFee int, interviewed bool) int {
	if interviewed {
		return int(math.Round(float64(signingFee) * (1 - negotiationBonus)))
	}
	return signingFee
}

func managerOverallOf(m map[string]any) int {
	if m["Overall"] != nil {
		return intOf(m["Overall"])
	}
	return ManagerOverall(attr(m, "Tactics"), attr(m, "Motivation"), attr(m, "Development"), attr(m, "Discipline"))
}

func attr(m map[string]any, key string) int {
	if v, ok := m[key]; ok && v != nil {
		return intOf(v)
	}
	return 50
}

func managerFeeOf(m map[string]any) int {
	if m["SigningFee"] != nil {
		return int(math.Round(float64(floatOf(m["SigningFee"]))))
	}
	return ManagerFee(managerOverallOf(m))
}

func managerWageOf(m map[string]any) int {
	if m["Wage"] != nil {
		return int(math.Round(floatOf(m["Wage"])))
	}
	return ManagerWage(managerOverallOf(m))
}

// --- operations ------------------------------------------------------------

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

func stringIDs(v any) []string {
	list, ok := v.([]any)
	if !ok {
		return []string{}
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func scouts(row map[string]any) map[string]any {
	m, _ := row["Scout"].(map[string]any)
	if m == nil {
		m = map[string]any{}
	}
	return m
}

// BrowseManagers lists the free-manager pool (masked) and records the browse.
func BrowseManagers(ctx context.Context, q db.Querier, clubID string) (map[string]any, error) {
	clubRow, ok, err := one(ctx, q, `SELECT "Budget" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errClubNotFound
	}
	rows, err := all(ctx, q, `SELECT * FROM "Managers" WHERE "isEmployed" = false AND "ClubId" IS NULL ORDER BY "SigningFee" ASC, "Key" ASC LIMIT $1`, maxManagerPool)
	if err != nil {
		return nil, err
	}
	program, _, err := one(ctx, q, `SELECT "Scout" FROM "OwnerProgram" WHERE "ClubId" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	interviewed := map[string]bool{}
	if program != nil {
		for _, id := range stringIDs(scouts(program)["interviewedManagerIds"]) {
			interviewed[id] = true
		}
	}
	ids := make([]string, 0, len(rows))
	managers := make([]any, 0, len(rows))
	for _, m := range rows {
		id := db.StringField(m, "_id")
		ids = append(ids, id)
		managers = append(managers, toPublicManager(m, interviewed[id]))
	}
	if len(ids) > 0 {
		_ = db.WithTx(ctx, q, func(tx db.Querier) error { return recordBrowsedManagers(ctx, tx, clubID, ids) })
	}
	return map[string]any{
		"managers":     managers,
		"budget":       floatOf(clubRow["Budget"]),
		"interviewFee": interviewFee,
	}, nil
}

func toPublicManager(m map[string]any, interviewed bool) map[string]any {
	overall := managerOverallOf(m)
	signingFee := managerFeeOf(m)
	lo, hi := MaskRange(overall, hiddenSpread, attrMin, attrMax)
	tl, th := MaskRange(attr(m, "Tactics"), hiddenSpread, attrMin, attrMax)
	ml, mh := MaskRange(attr(m, "Motivation"), hiddenSpread, attrMin, attrMax)
	dl, dh := MaskRange(attr(m, "Development"), hiddenSpread, attrMin, attrMax)
	disl, dish := MaskRange(attr(m, "Discipline"), hiddenSpread, attrMin, attrMax)
	return map[string]any{
		"id":                 db.StringField(m, "_id"),
		"firstName":          db.StringField(m, "FirstName"),
		"lastName":           db.StringField(m, "LastName"),
		"age":                intOf(m["Age"]),
		"nationalityId":      nilIfEmpty(db.StringField(m, "NationalityId")),
		"preferredFormation": m["PreferredFormation"],
		"preferredStyle":     m["PreferredStyle"],
		"overall":            rangeObj(lo, hi),
		"tactics":            rangeObj(tl, th),
		"motivation":         rangeObj(ml, mh),
		"development":        rangeObj(dl, dh),
		"discipline":         rangeObj(disl, dish),
		"interviewed":        interviewed,
		"signingFee":         signingFee,
		"effectiveFee":       EffectiveManagerFee(signingFee, interviewed),
		"wage":               managerWageOf(m),
	}
}

func rangeObj(low, high int) map[string]any { return map[string]any{"low": low, "high": high} }

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func recordBrowsedManagers(ctx context.Context, tx db.Querier, clubID string, ids []string) error {
	program, ok, err := one(ctx, tx, `SELECT "Scout" FROM "OwnerProgram" WHERE "ClubId" = $1 FOR UPDATE`, clubID)
	if err != nil || !ok {
		return err
	}
	scout := scouts(program)
	seen := map[string]bool{}
	order := []string{}
	for _, id := range stringIDs(scout["managerIdsBrowsed"]) {
		if !seen[id] {
			seen[id] = true
			order = append(order, id)
		}
	}
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			order = append(order, id)
		}
	}
	if len(order) > maxManagerPool {
		order = order[len(order)-maxManagerPool:]
	}
	scout["managerIdsBrowsed"] = order
	return setScout(ctx, tx, clubID, scout)
}

func setScout(ctx context.Context, tx db.Querier, clubID string, scout map[string]any) error {
	_, err := tx.Exec(ctx, `UPDATE "OwnerProgram" SET "Scout" = $2, "updatedAt" = now() WHERE "ClubId" = $1`, clubID, scout)
	return err
}

// InterviewManager pays the interview fee (once) and reveals the exact values.
func InterviewManager(ctx context.Context, q db.Querier, clubID, managerID string) (map[string]any, error) {
	var reveal map[string]any
	err := db.WithTx(ctx, q, func(tx db.Querier) error {
		program, ok, err := one(ctx, tx, `SELECT "Scout" FROM "OwnerProgram" WHERE "ClubId" = $1 FOR UPDATE`, clubID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("Program not started for this club")
		}
		manager, ok, err := one(ctx, tx, `SELECT * FROM "Managers" WHERE "_id" = $1 LIMIT 1`, managerID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("Manager not found")
		}
		if boolOf(manager["isEmployed"]) || db.StringField(manager, "ClubId") != "" {
			return fmt.Errorf("That manager is already employed")
		}
		scout := scouts(program)
		already := contains(stringIDs(scout["interviewedManagerIds"]), managerID)
		if !already {
			ok, err := debitBudget(ctx, tx, clubID, interviewFee)
			if err != nil {
				return err
			}
			if !ok {
				return fmt.Errorf("Insufficient budget for an interview")
			}
			if err := insertLedger(ctx, tx, "manager_interview", clubID, "", interviewFee, fmt.Sprintf("Interview: %s %s", db.StringField(manager, "FirstName"), db.StringField(manager, "LastName"))); err != nil {
				return err
			}
			scout["interviewedManagerIds"] = append(stringIDs(scout["interviewedManagerIds"]), managerID)
			if err := setScout(ctx, tx, clubID, scout); err != nil {
				return err
			}
		}
		reveal = map[string]any{
			"id":          managerID,
			"overall":     managerOverallOf(manager),
			"tactics":     attr(manager, "Tactics"),
			"motivation":  attr(manager, "Motivation"),
			"development": attr(manager, "Development"),
			"discipline":  attr(manager, "Discipline"),
			"signingFee":  managerFeeOf(manager),
			"wage":        managerWageOf(manager),
		}
		return nil
	})
	return reveal, err
}

// SignManager hires a manager with a conditional budget debit.
func SignManager(ctx context.Context, q db.Querier, clubID, managerID string, contractYears int) (int, error) {
	paid := 0
	err := db.WithTx(ctx, q, func(tx db.Querier) error {
		clubRow, ok, err := one(ctx, tx, `SELECT "ManagerId" FROM "Clubs" WHERE "_id" = $1 FOR UPDATE`, clubID)
		if err != nil {
			return err
		}
		if !ok {
			return errClubNotFound
		}
		if db.StringField(clubRow, "ManagerId") != "" {
			return fmt.Errorf("This club already has a manager - release them first")
		}
		manager, ok, err := one(ctx, tx, `SELECT * FROM "Managers" WHERE "_id" = $1 FOR UPDATE`, managerID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("Manager not found")
		}
		program, _, err := one(ctx, tx, `SELECT "Scout" FROM "OwnerProgram" WHERE "ClubId" = $1 LIMIT 1`, clubID)
		if err != nil {
			return err
		}
		interviewed := false
		if program != nil {
			interviewed = contains(stringIDs(scouts(program)["interviewedManagerIds"]), managerID)
		}
		fee := EffectiveManagerFee(managerFeeOf(manager), interviewed)
		ok, err = debitBudget(ctx, tx, clubID, fee)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("Insufficient budget to sign this manager")
		}
		tag, err := tx.Exec(ctx, `UPDATE "Managers" SET "isEmployed" = true, "ClubId" = $1, "ContractYears" = $2,
			"ContractUntilYear" = coalesce((SELECT "CurrentYear" FROM "Calendars" LIMIT 1), 1) + $2, "updatedAt" = now()
			WHERE "_id" = $3 AND "isEmployed" = false AND "ClubId" IS NULL`, clubID, contractYears, managerID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return fmt.Errorf("Another club signed that manager first")
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "ManagerId" = $2, "updatedAt" = now() WHERE "_id" = $1`, clubID, managerID); err != nil {
			return err
		}
		if err := insertLedger(ctx, tx, "manager_signing", clubID, "", fee, fmt.Sprintf("Signed %s %s", db.StringField(manager, "FirstName"), db.StringField(manager, "LastName"))); err != nil {
			return err
		}
		paid = fee
		return nil
	})
	return paid, err
}

// ReleaseManager returns the club's manager to the pool.
func ReleaseManager(ctx context.Context, q db.Querier, clubID, managerID string) error {
	return db.WithTx(ctx, q, func(tx db.Querier) error {
		tag, err := tx.Exec(ctx, `UPDATE "Clubs" SET "ManagerId" = NULL, "updatedAt" = now() WHERE "_id" = $1 AND "ManagerId" = $2`, clubID, managerID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return fmt.Errorf("That is not your club manager")
		}
		_, err = tx.Exec(ctx, `UPDATE "Managers" SET "isEmployed" = false, "ClubId" = NULL, "ContractYears" = 0, "ContractUntilYear" = NULL, "updatedAt" = now() WHERE "_id" = $1 AND "ClubId" = $2`, managerID, clubID)
		return err
	})
}

// BrowsePlayers lists the free-agent pool (masked ratings).
func BrowsePlayers(ctx context.Context, q db.Querier, clubID string) (map[string]any, error) {
	clubRow, ok, err := one(ctx, q, `SELECT "Budget" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errClubNotFound
	}
	rows, err := all(ctx, q, `SELECT * FROM "Players" WHERE "isSigned" = false AND "isRetired" = false AND "Value" > 0 AND "ClubId" IS NULL ORDER BY "Value" ASC, "_id" ASC LIMIT $1`, maxPlayerPool)
	if err != nil {
		return nil, err
	}
	program, _, err := one(ctx, q, `SELECT "Scout" FROM "OwnerProgram" WHERE "ClubId" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	scouted := map[string]bool{}
	if program != nil {
		for _, id := range stringIDs(scouts(program)["scoutedPlayerIds"]) {
			scouted[id] = true
		}
	}
	total, err := squadTotal(ctx, q, clubID)
	if err != nil {
		return nil, err
	}
	players := make([]any, 0, len(rows))
	for _, p := range rows {
		players = append(players, toPublicPlayer(p, scouted[db.StringField(p, "_id")]))
	}
	needed := legalSquad - total
	if needed < 0 {
		needed = 0
	}
	return map[string]any{
		"players":  players,
		"budget":   floatOf(clubRow["Budget"]),
		"scoutFee": scoutFee,
		"needed":   needed,
	}, nil
}

func toPublicPlayer(p map[string]any, scouted bool) map[string]any {
	lo, hi := MaskRange(int(math.Round(floatOf(p["Rating"]))), hiddenSpread, 0, 100)
	return map[string]any{
		"id":            db.StringField(p, "_id"),
		"firstName":     db.StringField(p, "FirstName"),
		"lastName":      db.StringField(p, "LastName"),
		"age":           intOrNil(p["Age"]),
		"position":      p["Position"],
		"nationalityId": nilIfEmpty(db.StringField(p, "NationalityId")),
		"rating":        rangeObj(lo, hi),
		"scouted":       scouted,
		"value":         int(math.Round(floatOf(p["Value"]))),
		"wage":          int(math.Round(floatOf(p["Wage"]))),
	}
}

func squadTotal(ctx context.Context, q db.Querier, clubID string) (int, error) {
	row, ok, err := one(ctx, q, `SELECT count(*)::int AS total FROM "Players" WHERE "ClubId" = $1 AND "isSigned" = true AND "isRetired" = false`, clubID)
	if err != nil || !ok {
		return 0, err
	}
	return intOf(row["total"]), nil
}

// ScoutPlayer pays the scout fee (once) and reveals the exact attributes.
func ScoutPlayer(ctx context.Context, q db.Querier, clubID, playerID string) (map[string]any, error) {
	var reveal map[string]any
	err := db.WithTx(ctx, q, func(tx db.Querier) error {
		program, ok, err := one(ctx, tx, `SELECT "Scout" FROM "OwnerProgram" WHERE "ClubId" = $1 FOR UPDATE`, clubID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("Program not started for this club")
		}
		player, ok, err := one(ctx, tx, `SELECT * FROM "Players" WHERE "_id" = $1 LIMIT 1`, playerID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("Player not found")
		}
		if boolOf(player["isSigned"]) || db.StringField(player, "ClubId") != "" {
			return fmt.Errorf("That player is not a free agent")
		}
		scout := scouts(program)
		already := contains(stringIDs(scout["scoutedPlayerIds"]), playerID)
		if !already {
			ok, err := debitBudget(ctx, tx, clubID, scoutFee)
			if err != nil {
				return err
			}
			if !ok {
				return fmt.Errorf("Insufficient budget to scout")
			}
			if err := insertLedgerWithPlayer(ctx, tx, "player_scout", clubID, playerID, scoutFee, fmt.Sprintf("Scout: %s %s", db.StringField(player, "FirstName"), db.StringField(player, "LastName"))); err != nil {
				return err
			}
			scout["scoutedPlayerIds"] = append(stringIDs(scout["scoutedPlayerIds"]), playerID)
			if err := setScout(ctx, tx, clubID, scout); err != nil {
				return err
			}
		}
		attrs := map[string]any{}
		if raw, ok := player["Attributes"].(map[string]any); ok {
			for k, v := range raw {
				if _, isNum := v.(float64); isNum {
					attrs[k] = v
				} else if _, isNum := v.(int64); isNum {
					attrs[k] = v
				}
			}
		}
		reveal = map[string]any{
			"id":         playerID,
			"rating":     intOf(player["Rating"]),
			"attributes": attrs,
			"value":      int(math.Round(floatOf(player["Value"]))),
			"wage":       int(math.Round(floatOf(player["Wage"]))),
		}
		return nil
	})
	return reveal, err
}

// SignPlayer signs a free agent at Value (conditional debit + conditional sign).
func SignPlayer(ctx context.Context, q db.Querier, clubID, playerID string) (int, error) {
	paid := 0
	err := db.WithTx(ctx, q, func(tx db.Querier) error {
		clubRow, ok, err := one(ctx, tx, `SELECT "ClubCode" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
		if err != nil {
			return err
		}
		if !ok {
			return errClubNotFound
		}
		player, ok, err := one(ctx, tx, `SELECT * FROM "Players" WHERE "_id" = $1 LIMIT 1`, playerID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("Player not found")
		}
		price := int(math.Round(floatOf(player["Value"])))
		ok, err = debitBudget(ctx, tx, clubID, price)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("Insufficient budget to sign this player")
		}
		tag, err := tx.Exec(ctx, `UPDATE "Players" SET "isSigned" = true, "ClubId" = $2, "ClubCode" = $3,
			"isTransferListed" = false, "AskingPrice" = NULL, "updatedAt" = now()
			WHERE "_id" = $1 AND "isSigned" = false AND "isRetired" = false AND "ClubId" IS NULL`,
			playerID, clubID, db.StringField(clubRow, "ClubCode"))
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return fmt.Errorf("Another club signed that player first")
		}
		if err := insertLedgerWithPlayer(ctx, tx, "transfer", clubID, playerID, price, fmt.Sprintf("Free agent: %s %s", db.StringField(player, "FirstName"), db.StringField(player, "LastName"))); err != nil {
			return err
		}
		paid = price
		return nil
	})
	if err != nil {
		return 0, err
	}
	if _, _, rerr := club.NewRepository(q).CalculateAndUpdateClubRating(ctx, clubID); rerr != nil {
		return paid, rerr
	}
	return paid, nil
}

// --- shared write helpers --------------------------------------------------

func debitBudget(ctx context.Context, tx db.Querier, clubID string, amount int) (bool, error) {
	tag, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) - $2, "updatedAt" = now()
		WHERE "_id" = $1 AND coalesce("Budget",0) >= $2`, clubID, amount)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func insertLedger(ctx context.Context, tx db.Querier, typ, clubID, playerID string, amount int, note string) error {
	return insertLedgerWithPlayer(ctx, tx, typ, clubID, playerID, amount, note)
}

func insertLedgerWithPlayer(ctx context.Context, tx db.Querier, typ, clubID, playerID string, amount int, note string) error {
	var pid any
	if playerID != "" {
		pid = playerID
	}
	_, err := tx.Exec(ctx, `INSERT INTO "TransferLedger" ("Type","PlayerId","BuyerClubId","Amount","Note","updatedAt")
		VALUES ($1,$2,$3,$4,$5,now())`, typ, pid, clubID, amount, note)
	return err
}
