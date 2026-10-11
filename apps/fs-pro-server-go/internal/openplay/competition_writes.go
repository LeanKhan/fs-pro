package openplay

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"fs-pro-server/internal/db"
)

// Competition-definition writes + the edition publish/cancel/invite lifecycle.

// CompetitionByCode returns a competition with the given (upper-cased) code.
func (r *Repository) CompetitionByCode(ctx context.Context, code string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Competitions" WHERE "CompetitionCode" = $1 LIMIT 1`, code)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// CreateCompetition inserts a competition row and returns it.
func (r *Repository) CreateCompetition(ctx context.Context, columns map[string]any) (map[string]any, error) {
	return db.InsertRow(ctx, r.q, "Competitions", columns)
}

// UpdateCompetition saves a competition row; ok is false when it does not exist.
func (r *Repository) UpdateCompetition(ctx context.Context, id string, columns map[string]any) (map[string]any, bool, error) {
	columns = db.CopyMap(columns)
	delete(columns, "_id")
	row, err := db.UpdateRow(ctx, r.q, "Competitions", "_id", id, columns, false)
	if err != nil {
		return nil, false, err
	}
	return row, row != nil, nil
}

// ArchiveCompetition sets the Archived flag; ok is false when it does not exist.
func (r *Repository) ArchiveCompetition(ctx context.Context, id string, archived bool) (map[string]any, bool, error) {
	row, err := db.UpdateRow(ctx, r.q, "Competitions", "_id", id, map[string]any{"Archived": archived}, true)
	if err != nil {
		return nil, false, err
	}
	return row, row != nil, nil
}

// PublishEdition snapshots the competition's definition into a draft edition
// and invites qualified clubs (edition.service publishEdition).
func (r *Repository) PublishEdition(ctx context.Context, seasonID string) (map[string]any, error) {
	var updated map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		season, err := seasonRow(ctx, tx, seasonID)
		if err != nil {
			return err
		}
		if db.StringField(season, "Status") != "draft" || season["Definition"] != nil {
			return editionError{code: "wrong-status", message: "Only an unpublished draft can be published"}
		}
		compID := db.StringField(season, "CompetitionId")
		comp, err := oneAt(ctx, tx, `SELECT * FROM "Competitions" WHERE "_id" = $1 LIMIT 1`, compID)
		if err != nil {
			return err
		}
		if comp == nil {
			return editionError{code: "not-found", message: fmt.Sprintf("Competition %s not found", compID)}
		}
		def, errs, ok := BuildDefinition(competitionDefinitionInput(comp))
		if !ok {
			return editionError{code: "invalid-definition", message: "Competition definition is invalid", details: errs}
		}
		raw, _ := json.Marshal(def)
		rows, err := tx.Query(ctx, `UPDATE "Seasons" SET "Definition" = $2::jsonb, "updatedAt" = now() WHERE "_id" = $1 RETURNING *`, seasonID, string(raw))
		if err != nil {
			return err
		}
		row, _, err := db.ScanOne(rows)
		if err != nil {
			return err
		}
		if err := inviteQualified(ctx, tx, row); err != nil {
			return err
		}
		updated = row
		return nil
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

// inviteQualified turns pending 'qualified' access rows into invites.
func inviteQualified(ctx context.Context, q db.Querier, season map[string]any) error {
	rows, err := q.Query(ctx, `SELECT * FROM "CompetitionAccess" WHERE "CompetitionId" = $1 AND "Kind" = 'qualified' AND "Used" = false`, db.StringField(season, "CompetitionId"))
	if err != nil {
		return err
	}
	pending, err := db.ScanAll(rows)
	if err != nil {
		return err
	}
	if len(pending) == 0 {
		return nil
	}
	for _, p := range pending {
		if _, err := q.Exec(ctx, `INSERT INTO "Entries" ("SeasonId","ClubId","Status","updatedAt") VALUES ($1,$2,'invited',now())
			ON CONFLICT ("SeasonId","ClubId") DO NOTHING`, db.StringField(season, "_id"), db.StringField(p, "ClubId")); err != nil {
			return err
		}
	}
	ids := make([]string, 0, len(pending))
	for _, p := range pending {
		ids = append(ids, db.StringField(p, "_id"))
	}
	_, err = q.Exec(ctx, `UPDATE "CompetitionAccess" SET "Used" = true WHERE "_id" = ANY($1)`, ids)
	return err
}

// CancelEdition refunds fees, closes open challenges and marks the edition
// cancelled (edition.service cancelEdition).
func (r *Repository) CancelEdition(ctx context.Context, seasonID, reason string) (map[string]any, error) {
	var updated map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		season, err := seasonRow(ctx, tx, seasonID)
		if err != nil {
			return err
		}
		st := db.StringField(season, "Status")
		if st == "finished" || st == "cancelled" {
			return editionError{code: "wrong-status", message: fmt.Sprintf("Edition is already %s", st)}
		}
		if err := refundFees(ctx, tx, season, nil); err != nil {
			return err
		}
		if err := closeOpenChallenges(ctx, tx, seasonID, "", ""); err != nil {
			return err
		}
		cal, err := calendarAt(ctx, tx)
		if err != nil {
			return err
		}
		logs := toAnyList(season["Logs"])
		logs = append(logs, map[string]any{"title": "Cancelled", "content": reason})
		raw, _ := json.Marshal(logs)
		rows, err := tx.Query(ctx, `UPDATE "Seasons" SET "Status" = 'cancelled', "EndDay" = $2, "Logs" = $3::jsonb, "updatedAt" = now() WHERE "_id" = $1 RETURNING *`,
			seasonID, intVal(cal["CurrentDay"]), string(raw))
		if err != nil {
			return err
		}
		row, _, err := db.ScanOne(rows)
		if err != nil {
			return err
		}
		updated = row
		return nil
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

// Invite creates 'invited' entries for the given clubs (edition.service invite).
func (r *Repository) Invite(ctx context.Context, seasonID string, clubIDs []string) ([]map[string]any, error) {
	season, err := seasonRow(ctx, r.q, seasonID)
	if err != nil {
		return nil, err
	}
	st := db.StringField(season, "Status")
	if st != "draft" && st != "registration" {
		return nil, editionError{code: "wrong-status", message: "Invites are only possible before the edition starts"}
	}
	if len(clubIDs) == 0 {
		return []map[string]any{}, nil
	}
	out := []map[string]any{}
	err = db.WithTx(ctx, r.q, func(tx db.Querier) error {
		for _, clubID := range clubIDs {
			rows, err := tx.Query(ctx, `INSERT INTO "Entries" ("SeasonId","ClubId","Status","updatedAt") VALUES ($1,$2,'invited',now())
				ON CONFLICT ("SeasonId","ClubId") DO NOTHING RETURNING *`, seasonID, clubID)
			if err != nil {
				return err
			}
			row, ok, err := db.ScanOne(rows)
			if err != nil {
				return err
			}
			if ok {
				out = append(out, row)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// CompetitionColumns builds the Competitions columns Node's columns() writes.
func CompetitionColumns(def map[string]any, typ string) map[string]any {
	allKnockout := true
	for _, s := range toMapList(def["Stages"]) {
		if db.StringField(s, "type") != "knockout" {
			allKnockout = false
		}
	}
	if typ == "" {
		if allKnockout {
			typ = "Cup"
		} else {
			typ = "League"
		}
	}
	return map[string]any{
		"Name":         db.StringField(def, "Name"),
		"Description":  nilIfEmpty(db.StringField(def, "Description")),
		"Type":         typ,
		"Prestige":     intVal(def["Prestige"]),
		"Entry":        def["Entry"],
		"Stages":       def["Stages"],
		"WinCondition": def["WinCondition"],
		"Rewards":      def["Rewards"],
		"Outcomes":     def["Outcomes"],
		"Recurrence":   def["Recurrence"],
		"updatedAt":    time.Now(),
	}
}
