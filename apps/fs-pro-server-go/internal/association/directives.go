package association

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Association Directives (02 §G, 04 §7): weekly shared tasks with tier rewards.
// Progress is tracked per member club (DirectiveProgress), and a tier reward can
// be claimed once per member per tier - enforced by a guarded UPDATE on
// ClaimedTier, so a replayed claim cannot pay twice.

// DirectiveDef is one seeded weekly directive.
type DirectiveDef struct {
	Code    string
	Title   string
	Tier    int
	Goal    int
	Rewards map[string]any
}

// WeeklyDirectives is the seeded weekly catalog (tunable). The tiers run from
// the easy shared task to the derby-driven one.
var WeeklyDirectives = []DirectiveDef{
	{Code: "matches", Title: "Play 5 matches", Tier: 1, Goal: 5, Rewards: map[string]any{"cash": 500, "fans": 200}},
	{Code: "wins", Title: "Win 3 matches", Tier: 2, Goal: 3, Rewards: map[string]any{"cash": 1000, "fans": 400}},
	{Code: "derby", Title: "Earn 10 derby stars", Tier: 3, Goal: 10, Rewards: map[string]any{"cash": 2000, "fans": 800, "xp": 100}},
}

// EnsureWeeklyDirectives seeds this week's directives for an association. It is
// idempotent (ON CONFLICT DO NOTHING).
func (r *Repository) EnsureWeeklyDirectives(ctx context.Context, assocID, weekKey string, now time.Time) error {
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if _, ok, err := assocRow(ctx, tx, assocID, false); err != nil {
			return err
		} else if !ok {
			return ErrAssociationNotFound
		}
		return seedDirectives(ctx, tx, assocID, weekKey, now)
	})
}

func seedDirectives(ctx context.Context, q db.Querier, assocID, weekKey string, now time.Time) error {
	for _, def := range WeeklyDirectives {
		if _, err := q.Exec(ctx, `INSERT INTO "Directives" ("AssociationId", "WeekKey", "Code", "Title", "Tier", "Goal", "Rewards", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT ("AssociationId", "WeekKey", "Code") DO NOTHING`,
			assocID, weekKey, def.Code, def.Title, def.Tier, def.Goal, def.Rewards, now); err != nil {
			return err
		}
	}
	return nil
}

// ListDirectives returns the week's directives with the given club's progress
// (clubID may be empty for a spectator read).
func (r *Repository) ListDirectives(ctx context.Context, assocID, weekKey, clubID string, now time.Time) (map[string]any, bool, error) {
	if _, ok, err := assocRow(ctx, r.q, assocID, false); err != nil {
		return nil, false, err
	} else if !ok {
		return nil, false, nil
	}
	if err := seedDirectives(ctx, r.q, assocID, weekKey, now); err != nil {
		return nil, false, err
	}
	rows, err := scanAll(ctx, r.q, `SELECT d."_id", d."Code", d."Title", d."Tier", d."Goal", d."Rewards",
			p."Progress", p."ClaimedTier"
		FROM "Directives" d
		LEFT JOIN "DirectiveProgress" p ON p."DirectiveId" = d."_id" AND p."ClubId" = $2
		WHERE d."AssociationId" = $1 AND d."WeekKey" = $3
		ORDER BY d."Tier", d."Code"`, assocID, nullString(clubID), weekKey)
	if err != nil {
		return nil, false, err
	}
	list := make([]any, 0, len(rows))
	for _, row := range rows {
		progress := intOf(row["Progress"])
		claimed := intOf(row["ClaimedTier"])
		goal := intOf(row["Goal"])
		tier := intOf(row["Tier"])
		list = append(list, map[string]any{
			"id":          db.StringField(row, "_id"),
			"code":        db.StringField(row, "Code"),
			"title":       db.StringField(row, "Title"),
			"tier":        tier,
			"goal":        goal,
			"rewards":     row["Rewards"],
			"progress":    progress,
			"claimedTier": claimed,
			"canClaim":    CanClaimTier(progress, goal, claimed, tier),
		})
	}
	return map[string]any{
		"associationId": assocID,
		"weekKey":       weekKey,
		"directives":    list,
	}, true, nil
}

// AddDirectiveProgress credits progress to every directive of the week's set
// for a member club (used for matches/derby attempts).
func (r *Repository) AddDirectiveProgress(ctx context.Context, assocID, clubID string, delta int, now time.Time) error {
	if delta <= 0 {
		return nil
	}
	if _, ok, err := memberRole(ctx, r.q, assocID, clubID); err != nil {
		return err
	} else if !ok {
		return ErrNotAMember
	}
	_, err := r.q.Exec(ctx, `INSERT INTO "DirectiveProgress" ("DirectiveId", "ClubId", "Progress", "updatedAt")
		SELECT d."_id", $2, $3, $4 FROM "Directives" d WHERE d."AssociationId" = $1
		ON CONFLICT ("DirectiveId", "ClubId") DO UPDATE
		SET "Progress" = "DirectiveProgress"."Progress" + EXCLUDED."Progress", "updatedAt" = EXCLUDED."updatedAt"`,
		assocID, clubID, delta, now)
	return err
}

// ClaimDirectiveTier grants one tier reward to a member club. The claim is
// once-per-member-per-tier: the guarded UPDATE only matches when the member has
// reached the goal and has not yet claimed that tier.
func (r *Repository) ClaimDirectiveTier(ctx context.Context, assocID, directiveID, clubID string, tier int, now time.Time) (map[string]any, error) {
	if tier < 1 {
		return nil, ErrInvalidInput
	}
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if _, ok, err := assocRow(ctx, tx, assocID, false); err != nil {
			return err
		} else if !ok {
			return ErrAssociationNotFound
		}
		if _, ok, err := memberRole(ctx, tx, assocID, clubID); err != nil {
			return err
		} else if !ok {
			return ErrNotAMember
		}
		directive, ok, err := scanOne(ctx, tx, `SELECT "_id", "Tier", "Goal", "Rewards" FROM "Directives" WHERE "_id" = $1 AND "AssociationId" = $2 FOR UPDATE`, directiveID, assocID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrDirectiveNotFound
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "DirectiveProgress" ("DirectiveId", "ClubId", "Progress", "updatedAt")
			VALUES ($1, $2, 0, $3) ON CONFLICT ("DirectiveId", "ClubId") DO NOTHING`, directiveID, clubID, now); err != nil {
			return err
		}
		progressRow, _, err := scanOne(ctx, tx, `SELECT "Progress", "ClaimedTier" FROM "DirectiveProgress" WHERE "DirectiveId" = $1 AND "ClubId" = $2`, directiveID, clubID)
		if err != nil {
			return err
		}
		goal := intOf(directive["Goal"])
		progress := intOf(progressRow["Progress"])
		claimed := intOf(progressRow["ClaimedTier"])
		if claimed >= tier {
			return ErrTierAlreadyClaimed
		}
		if !CanClaimTier(progress, goal, claimed, tier) {
			return ErrTierNotReached
		}
		tag, err := tx.Exec(ctx, `UPDATE "DirectiveProgress" SET "ClaimedTier" = $3, "updatedAt" = $4
			WHERE "DirectiveId" = $1 AND "ClubId" = $2 AND "ClaimedTier" < $3 AND "Progress" >= $5`,
			directiveID, clubID, tier, now, goal)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrTierAlreadyClaimed
		}
		rewards, _ := directive["Rewards"].(map[string]any)
		cash := floatOf(rewards["cash"])
		fans := intOf(rewards["fans"])
		xp := intOf(rewards["xp"])
		if err := creditCash(ctx, tx, clubID, cash); err != nil {
			return err
		}
		if err := creditFans(ctx, tx, clubID, fans); err != nil {
			return err
		}
		if err := writeLedger(ctx, tx, "directive", clubID, "", "", cash, "Directive tier reward"); err != nil {
			return err
		}
		if xp > 0 {
			if err := addXp(ctx, tx, assocID, xp); err != nil {
				return err
			}
		}
		out = map[string]any{
			"directiveId": directiveID,
			"clubId":      clubID,
			"tier":        tier,
			"claimedTier": tier,
			"rewards":     rewards,
		}
		return nil
	})
	return out, err
}
