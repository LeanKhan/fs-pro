package association

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Derby lifecycle (02 §G, 06 P7): a scheduled prep -> battle -> complete event
// between two associations. Each member club gets DerbyAttemptsPerClub attacks;
// total stars decide, then mean destruction (the audited DerbyResult tiebreak).
// Resolution is guarded by Derbies.CompletedAt so a crashed-and-retried worker
// tick never pays the loot twice.

const derbyColumns = `SELECT "_id", "HomeAssocId", "AwayAssocId", "Phase", "PrepStartsAt", "BattleStartsAt",
	"EndsAt", "HomeStars", "AwayStars", "HomeDestruction", "AwayDestruction", "CompletedAt" FROM "Derbies"`

// CreateDerby schedules a Derby between two associations. A practice Derby
// (02 §D2 Friendly Derby) pays no rewards at resolution; its marker is kept in
// the home association's grounds Layout jsonb because the Derbies table has no
// Practice column (a dedicated column is a migration outside this package).
func (r *Repository) CreateDerby(ctx context.Context, homeAssocID, awayAssocID string, prepStarts, battleStarts, ends time.Time, practice bool, now time.Time) (map[string]any, error) {
	if homeAssocID == "" || awayAssocID == "" || homeAssocID == awayAssocID {
		return nil, ErrInvalidInput
	}
	if prepStarts.After(battleStarts) || !battleStarts.Before(ends) {
		return nil, ErrInvalidInput
	}
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		for _, id := range []string{homeAssocID, awayAssocID} {
			if _, ok, err := assocRow(ctx, tx, id, false); err != nil {
				return err
			} else if !ok {
				return ErrAssociationNotFound
			}
		}
		row, err := db.InsertRow(ctx, tx, "Derbies", map[string]any{
			"HomeAssocId": homeAssocID, "AwayAssocId": awayAssocID, "Phase": string(PhasePrep),
			"PrepStartsAt": prepStarts, "BattleStartsAt": battleStarts, "EndsAt": ends, "updatedAt": now,
		})
		if err != nil {
			return err
		}
		if practice {
			if err := markPractice(ctx, tx, homeAssocID, db.StringField(row, "_id")); err != nil {
				return err
			}
		}
		out = derbyPayload(row, nil, practice)
		return nil
	})
	return out, err
}

// RecordAttempt resolves one Derby attack by a member club of `assocID` against
// a member club of the rival association. It is idempotent per
// (derby, attacker, attempt): the DerbyMatches unique constraint plus the
// attempts-per-club check make a replay a 409 rather than a double score.
func (r *Repository) RecordAttempt(ctx context.Context, derbyID, assocID, clubID, defenderClubID string, stars int, destruction float64, now time.Time) (map[string]any, error) {
	if stars < 0 || stars > 3 || destruction < 0 || destruction > 100 {
		return nil, ErrInvalidInput
	}
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		derby, ok, err := scanOne(ctx, tx, derbyColumns+` WHERE "_id" = $1 FOR UPDATE`, derbyID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrDerbyNotFound
		}
		if derby["CompletedAt"] != nil || Phase(db.StringField(derby, "Phase")) == PhaseComplete {
			return ErrDerbyComplete
		}
		if Phase(db.StringField(derby, "Phase")) != PhaseBattle {
			return ErrDerbyNotInBattle
		}
		home := db.StringField(derby, "HomeAssocId")
		away := db.StringField(derby, "AwayAssocId")
		if assocID != home && assocID != away {
			return ErrNotParticipant
		}
		if _, ok, err := memberRole(ctx, tx, assocID, clubID); err != nil {
			return err
		} else if !ok {
			return ErrNotAMember
		}
		rival := away
		if assocID == away {
			rival = home
		}
		if _, ok, err := memberRole(ctx, tx, rival, defenderClubID); err != nil {
			return err
		} else if !ok {
			return ErrOpponentNotMember
		}
		resolved, _, err := scanOne(ctx, tx, `SELECT count(*)::int AS n FROM "DerbyMatches" WHERE "DerbyId" = $1 AND "AttackerClubId" = $2`, derbyID, clubID)
		if err != nil {
			return err
		}
		if !CanAttempt(intOf(resolved["n"])) {
			return ErrAttemptsExhausted
		}
		attempt := intOf(resolved["n"]) + 1
		if _, err := tx.Exec(ctx, `INSERT INTO "DerbyMatches" ("DerbyId", "AttackerClubId", "DefenderClubId", "Attempt", "Stars", "Destruction", "ResolvedAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`, derbyID, clubID, defenderClubID, attempt, stars, destruction, now); err != nil {
			return mapUnique(err)
		}
		if err := refreshAggregate(ctx, tx, derbyID, now); err != nil {
			return err
		}
		// A derby closes when every club has used its attempts or the window ends.
		if exhausted, err := derbyExhausted(ctx, tx, derbyID, home, away); err != nil {
			return err
		} else if exhausted || !now.Before(parseDue(derby["EndsAt"])) {
			if _, err := finalizeDerby(ctx, tx, derbyID, now); err != nil {
				return err
			}
		}
		updated, ok, err := scanOne(ctx, tx, derbyColumns+` WHERE "_id" = $1`, derbyID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrDerbyNotFound
		}
		matches, err := r.matches(ctx, tx, derbyID)
		if err != nil {
			return err
		}
		practice, err := isPractice(ctx, tx, derbyID)
		if err != nil {
			return err
		}
		out = derbyPayload(updated, matches, practice)
		return nil
	})
	return out, err
}

// AdvanceDerby moves a Derby through its scheduled phases and resolves it when
// its window has ended. It is idempotent: phase writes are monotonic and the
// finalize step is guarded by CompletedAt.
func (r *Repository) AdvanceDerby(ctx context.Context, derbyID string, now time.Time) (map[string]any, error) {
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		derby, ok, err := scanOne(ctx, tx, derbyColumns+` WHERE "_id" = $1 FOR UPDATE`, derbyID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrDerbyNotFound
		}
		if derby["CompletedAt"] == nil {
			if !now.Before(parseDue(derby["EndsAt"])) {
				if _, err := finalizeDerby(ctx, tx, derbyID, now); err != nil {
					return err
				}
			} else if !now.Before(parseDue(derby["BattleStartsAt"])) && Phase(db.StringField(derby, "Phase")) == PhasePrep {
				if _, err := tx.Exec(ctx, `UPDATE "Derbies" SET "Phase" = 'battle', "updatedAt" = $2 WHERE "_id" = $1 AND "Phase" = 'prep'`, derbyID, now); err != nil {
					return err
				}
			}
		}
		updated, ok, err := scanOne(ctx, tx, derbyColumns+` WHERE "_id" = $1`, derbyID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrDerbyNotFound
		}
		matches, err := r.matches(ctx, tx, derbyID)
		if err != nil {
			return err
		}
		practice, err := isPractice(ctx, tx, derbyID)
		if err != nil {
			return err
		}
		out = derbyPayload(updated, matches, practice)
		return nil
	})
	return out, err
}

// GetDerby returns a Derby's full read model.
func (r *Repository) GetDerby(ctx context.Context, derbyID string) (map[string]any, bool, error) {
	row, ok, err := scanOne(ctx, r.q, derbyColumns+` WHERE "_id" = $1`, derbyID)
	if err != nil || !ok {
		return nil, ok, err
	}
	matches, err := r.matches(ctx, r.q, derbyID)
	if err != nil {
		return nil, false, err
	}
	practice, err := isPractice(ctx, r.q, derbyID)
	if err != nil {
		return nil, false, err
	}
	return derbyPayload(row, matches, practice), true, nil
}

// ResolveDueDerbies is the world-worker tick: it advances every open Derby's
// phase and resolves the ones whose window has closed. It returns how many it
// resolved. Shared by the Association worker ticker.
func ResolveDueDerbies(ctx context.Context, q db.Querier, now time.Time) (int, error) {
	rows, err := scanAll(ctx, q, `SELECT "_id" FROM "Derbies" WHERE "CompletedAt" IS NULL AND "EndsAt" <= $1`, now)
	if err != nil {
		return 0, err
	}
	resolved := 0
	for _, row := range rows {
		id := db.StringField(row, "_id")
		done, err := finalizeDerby(ctx, q, id, now)
		if err != nil {
			return resolved, err
		}
		if done {
			resolved++
		}
	}
	// Open the battle phase of any derby whose window has started.
	if _, err := q.Exec(ctx, `UPDATE "Derbies" SET "Phase" = 'battle', "updatedAt" = $1
		WHERE "CompletedAt" IS NULL AND "Phase" = 'prep' AND "BattleStartsAt" <= $1 AND "EndsAt" > $1`, now); err != nil {
		return resolved, err
	}
	return resolved, nil
}

// AssociationTick is the world-worker job body: it resolves due derbies. It is
// exposed as a plain func(ctx, tx) error so the world-worker registry can wrap
// it as a Ticker (its Job type is identical) without this package importing
// the worker. Festival Weekend open/close is computed on read (FestivalActive),
// so no separate transition is needed.
func AssociationTick(now func() time.Time) func(ctx context.Context, tx db.Querier) error {
	if now == nil {
		now = time.Now
	}
	return func(ctx context.Context, tx db.Querier) error {
		_, err := ResolveDueDerbies(ctx, tx, now().UTC())
		return err
	}
}

// --- internals -------------------------------------------------------------

// finalizeDerby scores a Derby once and pays the winner. It reports whether it
// performed the resolution (false when it had already completed). The guarded
// UPDATE is the once-only ledger guard.
func finalizeDerby(ctx context.Context, q db.Querier, derbyID string, now time.Time) (bool, error) {
	derby, ok, err := scanOne(ctx, q, derbyColumns+` WHERE "_id" = $1`, derbyID)
	if err != nil {
		return false, err
	}
	if !ok || derby["CompletedAt"] != nil {
		return false, nil
	}
	if err := refreshAggregate(ctx, q, derbyID, now); err != nil {
		return false, err
	}
	derby, _, err = scanOne(ctx, q, derbyColumns+` WHERE "_id" = $1`, derbyID)
	if err != nil {
		return false, err
	}
	home := db.StringField(derby, "HomeAssocId")
	away := db.StringField(derby, "AwayAssocId")
	agg := DerbyAggregate{
		HomeStars:       intOf(derby["HomeStars"]),
		AwayStars:       intOf(derby["AwayStars"]),
		HomeDestruction: floatOf(derby["HomeDestruction"]),
		AwayDestruction: floatOf(derby["AwayDestruction"]),
	}
	result := DecideDerby(agg)
	practice, err := isPractice(ctx, q, derbyID)
	if err != nil {
		return false, err
	}
	tag, err := q.Exec(ctx, `UPDATE "Derbies" SET "Phase" = 'complete', "CompletedAt" = $2, "updatedAt" = $2
		WHERE "_id" = $1 AND "CompletedAt" IS NULL`, derbyID, now)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 0 {
		return false, nil
	}
	if !practice && result != Draw {
		winner := home
		if result == Away {
			winner = away
		}
		reward := float64(DerbyReward(result, practice, agg.HomeStars+agg.AwayStars))
		clubIDs, err := sideClubIDs(ctx, q, winner)
		if err != nil {
			return false, err
		}
		for _, clubID := range clubIDs {
			if err := creditBoardVault(ctx, q, clubID, reward); err != nil {
				return false, err
			}
			if err := writeLedger(ctx, q, "derby", clubID, "", "", reward, "Derby victory"); err != nil {
				return false, err
			}
		}
		if err := addXp(ctx, q, winner, 100); err != nil {
			return false, err
		}
	}
	if practice {
		if err := clearPractice(ctx, q, derbyID); err != nil {
			return false, err
		}
	}
	return true, nil
}

// refreshAggregate recomputes the Derby's stored stars/destruction from its
// resolved matches.
func refreshAggregate(ctx context.Context, q db.Querier, derbyID string, now time.Time) error {
	derby, ok, err := scanOne(ctx, q, `SELECT "HomeAssocId", "AwayAssocId" FROM "Derbies" WHERE "_id" = $1`, derbyID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrDerbyNotFound
	}
	homeSide, err := sideSet(ctx, q, db.StringField(derby, "HomeAssocId"))
	if err != nil {
		return err
	}
	matches, err := loadMatchRows(ctx, q, derbyID)
	if err != nil {
		return err
	}
	agg := AggregateDerby(homeSide, matches)
	_, err = q.Exec(ctx, `UPDATE "Derbies" SET "HomeStars" = $2, "AwayStars" = $3, "HomeDestruction" = $4, "AwayDestruction" = $5, "updatedAt" = $6
		WHERE "_id" = $1`, derbyID, agg.HomeStars, agg.AwayStars, agg.HomeDestruction, agg.AwayDestruction, now)
	return err
}

// derbyExhausted reports whether every member club on both sides has used its
// attempts.
func derbyExhausted(ctx context.Context, q db.Querier, derbyID, homeAssocID, awayAssocID string) (bool, error) {
	for _, assocID := range []string{homeAssocID, awayAssocID} {
		members, _, err := scanOne(ctx, q, `SELECT count(*)::int AS n FROM "AssociationMembers" WHERE "AssociationId" = $1`, assocID)
		if err != nil {
			return false, err
		}
		used, _, err := scanOne(ctx, q, `SELECT count(*)::int AS n FROM "DerbyMatches" m
			JOIN "AssociationMembers" mem ON mem."ClubId" = m."AttackerClubId"
			WHERE m."DerbyId" = $1 AND mem."AssociationId" = $2`, derbyID, assocID)
		if err != nil {
			return false, err
		}
		if intOf(used["n"]) < intOf(members["n"])*DerbyAttemptsPerClub {
			return false, nil
		}
	}
	return true, nil
}

func sideClubIDs(ctx context.Context, q db.Querier, assocID string) ([]string, error) {
	rows, err := scanAll(ctx, q, `SELECT "ClubId" FROM "AssociationMembers" WHERE "AssociationId" = $1`, assocID)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		out = append(out, db.StringField(row, "ClubId"))
	}
	return out, nil
}

func sideSet(ctx context.Context, q db.Querier, assocID string) (map[string]bool, error) {
	ids, err := sideClubIDs(ctx, q, assocID)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	return set, nil
}

func loadMatchRows(ctx context.Context, q db.Querier, derbyID string) ([]DerbyMatch, error) {
	rows, err := scanAll(ctx, q, `SELECT "AttackerClubId", "Stars", "Destruction" FROM "DerbyMatches" WHERE "DerbyId" = $1`, derbyID)
	if err != nil {
		return nil, err
	}
	out := make([]DerbyMatch, 0, len(rows))
	for _, row := range rows {
		out = append(out, DerbyMatch{
			AttackerClubID: db.StringField(row, "AttackerClubId"),
			Stars:          intOf(row["Stars"]),
			Destruction:    floatOf(row["Destruction"]),
		})
	}
	return out, nil
}

// matches loads the Derby's attempts as payloads.
func (r *Repository) matches(ctx context.Context, q db.Querier, derbyID string) ([]any, error) {
	rows, err := scanAll(ctx, q, `SELECT "_id", "AttackerClubId", "DefenderClubId", "Attempt", "Stars", "Destruction", "ResolvedAt"
		FROM "DerbyMatches" WHERE "DerbyId" = $1 ORDER BY "Attempt", "createdAt"`, derbyID)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, map[string]any{
			"id":             db.StringField(row, "_id"),
			"attackerClubId": db.StringField(row, "AttackerClubId"),
			"defenderClubId": db.StringField(row, "DefenderClubId"),
			"attempt":        intOf(row["Attempt"]),
			"stars":          intOf(row["Stars"]),
			"destruction":    floatOf(row["Destruction"]),
			"resolvedAt":     nullableString(row["ResolvedAt"]),
		})
	}
	return out, nil
}

func derbyPayload(row map[string]any, matches []any, practice bool) map[string]any {
	agg := DerbyAggregate{
		HomeStars:       intOf(row["HomeStars"]),
		AwayStars:       intOf(row["AwayStars"]),
		HomeDestruction: floatOf(row["HomeDestruction"]),
		AwayDestruction: floatOf(row["AwayDestruction"]),
	}
	phase := db.StringField(row, "Phase")
	if phase == "" {
		phase = string(PhasePrep)
	}
	return map[string]any{
		"id":              db.StringField(row, "_id"),
		"homeAssocId":     db.StringField(row, "HomeAssocId"),
		"awayAssocId":     db.StringField(row, "AwayAssocId"),
		"phase":           phase,
		"homeStars":       agg.HomeStars,
		"awayStars":       agg.AwayStars,
		"homeDestruction": round(agg.HomeDestruction),
		"awayDestruction": round(agg.AwayDestruction),
		"prepStartsAt":    nullableString(row["PrepStartsAt"]),
		"battleStartsAt":  nullableString(row["BattleStartsAt"]),
		"endsAt":          nullableString(row["EndsAt"]),
		"completedAt":     nullableString(row["CompletedAt"]),
		"practice":        practice,
		"result":          resultName(DecideDerby(agg)),
		"matches":         matches,
	}
}

func resultName(r Result) string {
	switch r {
	case Home:
		return "home"
	case Away:
		return "away"
	default:
		return "draw"
	}
}

// parseDue parses an ISO timestamp from a row map; a missing/unparseable value
// becomes the zero time (so Before()-style checks never block a resolution).
func parseDue(v any) time.Time {
	s, _ := v.(string)
	if s == "" {
		return time.Time{}
	}
	for _, layout := range []string{"2006-01-02T15:04:05.000Z", time.RFC3339Nano, time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t
		}
	}
	return time.Time{}
}

// addXp is the package-internal XP award (used by the derby resolver).
func addXp(ctx context.Context, q db.Querier, assocID string, xp int) error {
	if xp <= 0 {
		return nil
	}
	row, ok, err := scanOne(ctx, q, `UPDATE "Associations" SET "Xp" = "Xp" + $2 WHERE "_id" = $1 RETURNING "Xp"`, assocID, xp)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	level := LevelForXp(intOf(row["Xp"]))
	_, err = q.Exec(ctx, `UPDATE "Associations" SET "Level" = $2 WHERE "_id" = $1 AND "Level" < $2`, assocID, level)
	return err
}

// markPractice records a practice Derby id in an association's grounds Layout.
// jsonb_set cannot create intermediate keys, so the marker is a one-level
// `practiceDerbies` object merged with the new id.
func markPractice(ctx context.Context, q db.Querier, assocID, derbyID string) error {
	_, err := q.Exec(ctx, `UPDATE "AssociationGrounds"
		SET "Layout" = jsonb_set(coalesce("Layout", '{}'::jsonb), '{practiceDerbies}',
			coalesce("Layout" -> 'practiceDerbies', '{}'::jsonb) || jsonb_build_object($2::text, true), true)
		WHERE "AssociationId" = $1`, assocID, derbyID)
	return err
}

// isPractice reports whether a Derby id is marked as a practice Derby.
func isPractice(ctx context.Context, q db.Querier, derbyID string) (bool, error) {
	_, ok, err := scanOne(ctx, q, `SELECT 1 AS ok FROM "AssociationGrounds" WHERE "Layout" -> 'practiceDerbies' ? $1 LIMIT 1`, derbyID)
	return ok, err
}

// clearPractice removes a resolved practice Derby's marker from every grounds.
func clearPractice(ctx context.Context, q db.Querier, derbyID string) error {
	_, err := q.Exec(ctx, `UPDATE "AssociationGrounds" SET "Layout" = "Layout" #- ARRAY['practiceDerbies', $1]::text[]
		WHERE "Layout" -> 'practiceDerbies' ? $1`, derbyID)
	return err
}
