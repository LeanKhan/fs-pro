package association

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"fs-pro-server/internal/db"
)

// Sentinel errors the handlers map to HTTP statuses. Named after the condition,
// not the status.
var (
	ErrAssociationNotFound = errors.New("association not found")
	ErrClubNotFound        = errors.New("club not found")
	ErrPlayerNotFound      = errors.New("player not found")
	ErrNotAMember          = errors.New("club is not a member of this association")
	ErrAlreadyMember       = errors.New("club is already in an association")
	ErrMemberCap           = errors.New("association is full")
	ErrClosed              = errors.New("association is not open to join")
	ErrNameTaken           = errors.New("association name is taken")
	ErrTagTaken            = errors.New("association tag is taken")
	ErrInvalidInput        = errors.New("invalid input")
	ErrForbidden           = errors.New("you cannot do that")

	ErrLoanExists    = errors.New("player already has an open loan")
	ErrLoanNotFound  = errors.New("loan not found")
	ErrPlayerNotHere = errors.New("player is not at that club")
	ErrLoanSlotsFull = errors.New("no loan slots available")

	ErrDerbyNotFound     = errors.New("derby not found")
	ErrDerbyNotInBattle  = errors.New("derby is not in the battle phase")
	ErrDerbyComplete     = errors.New("derby is already complete")
	ErrAttemptsExhausted = errors.New("no derby attempts left for this club")
	ErrNotParticipant    = errors.New("association is not part of this derby")
	ErrOpponentNotMember = errors.New("opponent club is not in the rival association")

	ErrDirectiveNotFound  = errors.New("directive not found")
	ErrTierNotReached     = errors.New("directive tier goal not reached")
	ErrTierAlreadyClaimed = errors.New("directive tier already claimed")

	ErrInsufficientFunds = errors.New("insufficient funds")
	ErrGroundsMaxed      = errors.New("association grounds are at maximum level")
)

// Repository is the pgx-backed association store. Reads use the column-keyed
// map passthrough (db.ScanOne/ScanAll); every mutation runs in a transaction.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier (ad-hoc reads).
func (r *Repository) Q() db.Querier { return r.q }

// assocColumns are the Associations fields the read model needs.
const assocColumns = `"_id", "Name", "Tag", "Description", "Level", "Xp", "Region", "Open"`

// scanOne reads a single row into a column-keyed map.
func scanOne(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// scanAll reads every row into column-keyed maps.
func scanAll(ctx context.Context, q db.Querier, sql string, args ...any) ([]map[string]any, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// assocRow reads an association row, optionally locking it for a mutation.
func assocRow(ctx context.Context, q db.Querier, id string, forUpdate bool) (map[string]any, bool, error) {
	sql := `SELECT ` + assocColumns + ` FROM "Associations" WHERE "_id" = $1`
	if forUpdate {
		sql += ` FOR UPDATE`
	}
	return scanOne(ctx, q, sql, id)
}

func memberCount(ctx context.Context, q db.Querier, assocID string) (int, error) {
	row, ok, err := scanOne(ctx, q, `SELECT count(*)::int AS n FROM "AssociationMembers" WHERE "AssociationId" = $1`, assocID)
	if err != nil || !ok {
		return 0, err
	}
	return intOf(row["n"]), nil
}

func memberRole(ctx context.Context, q db.Querier, assocID, clubID string) (Role, bool, error) {
	row, ok, err := scanOne(ctx, q, `SELECT "Role" FROM "AssociationMembers" WHERE "AssociationId" = $1 AND "ClubId" = $2`, assocID, clubID)
	if err != nil || !ok {
		return "", false, err
	}
	return Role(db.StringField(row, "Role")), true, nil
}

// buildAssociation is the AssociationSchema-shaped payload.
func buildAssociation(row map[string]any, count int) map[string]any {
	level := intOf(row["Level"])
	if level < 1 {
		level = 1
	}
	p := PerksForLevel(level)
	return map[string]any{
		"id":          db.StringField(row, "_id"),
		"name":        db.StringField(row, "Name"),
		"tag":         db.StringField(row, "Tag"),
		"description": nullableString(row["Description"]),
		"level":       level,
		"xp":          intOf(row["Xp"]),
		"memberCount": count,
		"maxMembers":  MaxMembers,
		"open":        boolOf(row["Open"]),
		"region":      nullableString(row["Region"]),
		"loanSlots":   LoanSlots(level),
		"perks": map[string]any{
			"vaultBonusPct":  p.VaultBonusPct,
			"incomeBonusPct": p.IncomeBonusPct,
		},
	}
}

// Create founds an association and adds the founding club as its leader. The
// insert is transactional; unique name/tag collisions become ErrNameTaken /
// ErrTagTaken (the membership unique constraint becomes ErrAlreadyMember).
func (r *Repository) Create(ctx context.Context, clubID, name, tag, description string, now time.Time) (map[string]any, error) {
	name = strings.TrimSpace(name)
	tag = strings.TrimSpace(tag)
	description = strings.TrimSpace(description)
	if name == "" || tag == "" || len([]rune(name)) > 40 || len([]rune(tag)) > 6 {
		return nil, ErrInvalidInput
	}
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if _, ok, err := scanOne(ctx, tx, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1`, clubID); err != nil {
			return err
		} else if !ok {
			return ErrClubNotFound
		}
		if _, ok, err := scanOne(ctx, tx, `SELECT "_id" FROM "AssociationMembers" WHERE "ClubId" = $1`, clubID); err != nil {
			return err
		} else if ok {
			return ErrAlreadyMember
		}
		row, err := db.InsertRow(ctx, tx, "Associations", map[string]any{
			"Name": name, "Tag": tag, "Description": nullString(description),
			"Level": 1, "Xp": 0, "Open": true, "updatedAt": now,
		})
		if err != nil {
			return mapUnique(err)
		}
		assocID := db.StringField(row, "_id")
		if _, err := tx.Exec(ctx, `INSERT INTO "AssociationMembers" ("AssociationId", "ClubId", "Role", "updatedAt")
			VALUES ($1, $2, 'leader', $3)`, assocID, clubID, now); err != nil {
			return mapUnique(err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "AssociationGrounds" ("AssociationId", "Level", "CapitalGold", "updatedAt")
			VALUES ($1, 1, 0, $2) ON CONFLICT ("AssociationId") DO NOTHING`, assocID, now); err != nil {
			return err
		}
		out = buildAssociation(row, 1)
		out["members"] = []any{memberPayload(clubID, RoleLeader, "", "")}
		return nil
	})
	return out, err
}

// Get returns the association read model (member list + grounds included).
func (r *Repository) Get(ctx context.Context, assocID string, now time.Time) (map[string]any, bool, error) {
	row, ok, err := assocRow(ctx, r.q, assocID, false)
	if err != nil || !ok {
		return nil, ok, err
	}
	count, err := memberCount(ctx, r.q, assocID)
	if err != nil {
		return nil, false, err
	}
	out := buildAssociation(row, count)
	members, err := r.members(ctx, assocID)
	if err != nil {
		return nil, false, err
	}
	out["members"] = members
	grounds, err := r.GetGrounds(ctx, assocID, now)
	if err != nil {
		return nil, false, err
	}
	out["grounds"] = grounds
	return out, true, nil
}

// members lists the association's member clubs with their role and name.
func (r *Repository) members(ctx context.Context, assocID string) ([]any, error) {
	rows, err := scanAll(ctx, r.q, `SELECT m."ClubId", m."Role", c."Name", c."ClubCode"
		FROM "AssociationMembers" m JOIN "Clubs" c ON c."_id" = m."ClubId"
		WHERE m."AssociationId" = $1 ORDER BY m."createdAt", m."_id"`, assocID)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, memberPayload(
			db.StringField(row, "ClubId"),
			Role(db.StringField(row, "Role")),
			db.StringField(row, "Name"),
			db.StringField(row, "ClubCode"),
		))
	}
	return out, nil
}

func memberPayload(clubID string, role Role, name, code string) map[string]any {
	return map[string]any{"clubId": clubID, "role": string(role), "name": name, "code": code}
}

// Join adds a club to an open association that still has room. A club may only
// be in one association at a time (the DB unique constraint enforces it).
func (r *Repository) Join(ctx context.Context, assocID, clubID string, now time.Time) (map[string]any, error) {
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		assoc, ok, err := assocRow(ctx, tx, assocID, true)
		if err != nil {
			return err
		}
		if !ok {
			return ErrAssociationNotFound
		}
		if _, ok, err := scanOne(ctx, tx, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1`, clubID); err != nil {
			return err
		} else if !ok {
			return ErrClubNotFound
		}
		if _, ok, err := scanOne(ctx, tx, `SELECT "_id" FROM "AssociationMembers" WHERE "ClubId" = $1`, clubID); err != nil {
			return err
		} else if ok {
			return ErrAlreadyMember
		}
		if !boolOf(assoc["Open"]) {
			return ErrClosed
		}
		count, err := memberCount(ctx, tx, assocID)
		if err != nil {
			return err
		}
		if count >= MaxMembers {
			return ErrMemberCap
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "AssociationMembers" ("AssociationId", "ClubId", "Role", "updatedAt")
			VALUES ($1, $2, 'member', $3)`, assocID, clubID, now); err != nil {
			return mapUnique(err)
		}
		assoc, _, err = assocRow(ctx, tx, assocID, false)
		if err != nil {
			return err
		}
		out = buildAssociation(assoc, count+1)
		return nil
	})
	return out, err
}

// Leave removes a club from an association. If the departing club was the
// leader and others remain, the earliest-joined member is promoted, so the
// association never keeps a leader role that has left.
func (r *Repository) Leave(ctx context.Context, assocID, clubID string, now time.Time) error {
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if _, ok, err := assocRow(ctx, tx, assocID, true); err != nil {
			return err
		} else if !ok {
			return ErrAssociationNotFound
		}
		role, ok, err := memberRole(ctx, tx, assocID, clubID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrNotAMember
		}
		if _, err := tx.Exec(ctx, `DELETE FROM "AssociationMembers" WHERE "AssociationId" = $1 AND "ClubId" = $2`, assocID, clubID); err != nil {
			return err
		}
		if role == RoleLeader {
			if _, err := tx.Exec(ctx, `UPDATE "AssociationMembers" SET "Role" = 'leader', "updatedAt" = now()
				WHERE "_id" = (SELECT "_id" FROM "AssociationMembers" WHERE "AssociationId" = $1
					ORDER BY "createdAt", "_id" LIMIT 1)`, assocID); err != nil {
				return err
			}
		}
		return nil
	})
}

// AddXp awards association XP (from derbies/directives) and levels the
// association when the curve is crossed.
func (r *Repository) AddXp(ctx context.Context, assocID string, xp int, now time.Time) error {
	if xp <= 0 {
		return nil
	}
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		row, ok, err := scanOne(ctx, tx, `UPDATE "Associations" SET "Xp" = "Xp" + $2, "updatedAt" = $3
			WHERE "_id" = $1 RETURNING "Xp"`, assocID, xp, now)
		if err != nil {
			return err
		}
		if !ok {
			return ErrAssociationNotFound
		}
		level := LevelForXp(intOf(row["Xp"]))
		_, err = tx.Exec(ctx, `UPDATE "Associations" SET "Level" = $2 WHERE "_id" = $1 AND "Level" < $2`, assocID, level)
		return err
	})
}

// mapUnique translates a Postgres unique-constraint violation into the domain
// sentinel so the handler can answer 409 with a precise message.
func mapUnique(err error) error {
	var pg *pgconn.PgError
	if !errors.As(err, &pg) || pg.Code != "23505" {
		return err
	}
	switch pg.ConstraintName {
	case "Associations_Name_key", "Associations_name_unique":
		return ErrNameTaken
	case "Associations_Tag_key", "Associations_tag_unique":
		return ErrTagTaken
	case "association_members_club_uniq":
		return ErrAlreadyMember
	default:
		return fmt.Errorf("%w: %s", ErrInvalidInput, pg.ConstraintName)
	}
}

// --- small value helpers ---------------------------------------------------

func nullString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullableString(v any) any {
	s, _ := v.(string)
	if s == "" {
		return nil
	}
	return s
}

func boolOf(v any) bool {
	b, _ := v.(bool)
	return b
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float32:
		return int(n)
	case float64:
		return int(n)
	default:
		return 0
	}
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
