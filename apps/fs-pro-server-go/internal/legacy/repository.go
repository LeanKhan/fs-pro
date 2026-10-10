package legacy

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"fs-pro-server/internal/campus"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/seasonpass"
)

// This file wires the pure Club Legacy chain (legacy.go) and Club Honours to
// Postgres (docs/coc-mapping/02 §I/§K, 04 §2). Completing the chain grants the
// 6th Groundskeeper through the existing ClubGroundskeepers path, idempotently;
// Honours award Sponsor Credits / Club Regalia. Every mutation is transactional
// and ledgered.

// Sentinel errors the handlers map to HTTP statuses.
var (
	ErrClubNotFound     = errors.New("club not found")
	ErrUnknownStep      = errors.New("unknown legacy step")
	ErrChainIncomplete  = errors.New("the Club Legacy chain is not complete")
	ErrUnknownHonour    = errors.New("unknown honour")
	ErrHonourIncomplete = errors.New("honour is not complete")
	ErrInvalidProgress  = errors.New("progress must not be negative")
)

// ---------------------------------------------------------------------------
// Honours catalogue (content - tunable). Honours are the long-horizon goals
// (02 §I) that award Sponsor Credits and Club Regalia.
// ---------------------------------------------------------------------------

// HonourReward is an Honour's grant. Currency flows through the TransferLedger;
// Perks go into the club's Clubs.Perks inventory (campus.GrantPerks).
type HonourReward struct {
	Cash           float64
	Fans           int
	SponsorCredits int
	Perks          map[string]int
}

// Honour is one Club Honour.
type Honour struct {
	Code   string
	Title  string
	Goal   int
	Reward HonourReward
}

// Honours is the Club Honours catalogue (02 §I). Content - tunable.
var Honours = []Honour{
	{Code: "first-blood", Title: "Win your first fixture", Goal: 1, Reward: HonourReward{SponsorCredits: 10}},
	{Code: "fan-favourite", Title: "Reach 1,000 Fans", Goal: 1000, Reward: HonourReward{SponsorCredits: 20}},
	{Code: "clubhouse-t3", Title: "Reach Clubhouse tier 3", Goal: 3, Reward: HonourReward{Cash: 50000, SponsorCredits: 30}},
	{Code: "home-fortress", Title: "Win 10 home raids", Goal: 10, Reward: HonourReward{Cash: 25000, Perks: map[string]int{seasonpass.PerkRegalia: 1}}},
	{Code: "star-collector", Title: "Earn 50 raid stars", Goal: 50, Reward: HonourReward{SponsorCredits: 50, Perks: map[string]int{seasonpass.PerkInstantFinish: 1}}},
	{Code: "legacy-builder", Title: "Own 5 Groundskeepers", Goal: 5, Reward: HonourReward{SponsorCredits: 100}},
}

// HonourFor resolves an Honour by code.
func HonourFor(code string) (Honour, bool) {
	for _, h := range Honours {
		if h.Code == code {
			return h, true
		}
	}
	return Honour{}, false
}

// ---------------------------------------------------------------------------
// Repository.
// ---------------------------------------------------------------------------

// Repository is the pgx-backed Club Legacy / Honours store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier.
func (r *Repository) Q() db.Querier { return r.q }

func one(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
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

func ledger(ctx context.Context, q db.Querier, clubID, typ string, amount float64, note string) error {
	_, err := q.Exec(ctx, `INSERT INTO "TransferLedger" ("Type","BuyerClubId","Amount","Note","updatedAt")
		VALUES ($1,$2,$3,$4,now())`, typ, clubID, amount, note)
	return err
}

// ---------------------------------------------------------------------------
// Chain progress.
// ---------------------------------------------------------------------------

// stepByID resolves a chain step.
func stepByID(id string) (Step, bool) {
	for _, s := range Chain {
		if s.ID == id {
			return s, true
		}
	}
	return Step{}, false
}

// stars loads the club's per-step star map.
func (r *Repository) stars(ctx context.Context, q db.Querier, clubID string) (map[string]int, error) {
	rows, err := q.Query(ctx, `SELECT "Step","Progress" FROM "LegacyProgress" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make(map[string]int, len(list))
	for _, m := range list {
		out[db.StringField(m, "Step")] = intOf(m["Progress"])
	}
	return out, nil
}

// RecordStep sets a chain step's star progress (server-side path; monotonic, so
// a retry can never lower it). Idempotent.
func (r *Repository) RecordStep(ctx context.Context, clubID, step string, progress int) error {
	if _, ok := stepByID(step); !ok {
		return fmt.Errorf("%w: %s", ErrUnknownStep, step)
	}
	if progress < 0 {
		return ErrInvalidProgress
	}
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if found, err := lockClub(ctx, tx, clubID); err != nil {
			return err
		} else if !found {
			return ErrClubNotFound
		}
		_, err := tx.Exec(ctx, `INSERT INTO "LegacyProgress" ("ClubId","Step","Progress","updatedAt")
			VALUES ($1,$2,$3,now())
			ON CONFLICT ("ClubId","Step") DO UPDATE
			SET "Progress" = GREATEST("LegacyProgress"."Progress", EXCLUDED."Progress"), "updatedAt" = now()`,
			clubID, step, progress)
		return err
	})
}

func lockClub(ctx context.Context, q db.Querier, clubID string) (bool, error) {
	_, ok, err := one(ctx, q, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1 FOR UPDATE`, clubID)
	return ok, err
}

// groundskeepers returns the club's effective Groundskeeper count (never below
// the milestone grant its Clubhouse tier earned, 04 §2).
func groundskeepers(ctx context.Context, q db.Querier, clubID string, tier int) (int, error) {
	row, ok, err := one(ctx, q, `SELECT "Count" FROM "ClubGroundskeepers" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return 0, err
	}
	count := 0
	if ok {
		count = intOf(row["Count"])
	}
	if grant := campus.GroundskeepersForTier(tier); count < grant {
		count = grant
	}
	if count > campus.MaxGroundskeepers {
		count = campus.MaxGroundskeepers
	}
	if count < 1 {
		count = 1
	}
	return count, nil
}

// ClaimLegacy grants the 6th Groundskeeper once the chain is complete. It is
// idempotent: if the club already has the maximum Groundskeepers nothing is
// written, so a retry can never double-grant.
func (r *Repository) ClaimLegacy(ctx context.Context, clubID string) (map[string]any, error) {
	var payload map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		club, found, err := one(ctx, tx, `SELECT "_id","ClubhouseTier" FROM "Clubs" WHERE "_id" = $1 FOR UPDATE`, clubID)
		if err != nil {
			return err
		}
		if !found {
			return ErrClubNotFound
		}
		stars, err := r.stars(ctx, tx, clubID)
		if err != nil {
			return err
		}
		if !Complete(stars) {
			return fmt.Errorf("%w: %d/%d steps", ErrChainIncomplete, len(Chain)-len(Remaining(stars)), len(Chain))
		}
		count, err := groundskeepers(ctx, tx, clubID, intOf(club["ClubhouseTier"]))
		if err != nil {
			return err
		}
		if count < campus.MaxGroundskeepers {
			if _, err := tx.Exec(ctx, `INSERT INTO "ClubGroundskeepers" ("ClubId","Count","updatedAt")
				VALUES ($1,$2,now())
				ON CONFLICT ("ClubId") DO UPDATE SET "Count" = $2, "updatedAt" = now()`,
				clubID, campus.MaxGroundskeepers); err != nil {
				return err
			}
			if err := ledger(ctx, tx, clubID, "groundskeeper", float64(campus.MaxGroundskeepers),
				"Club Legacy: 6th Groundskeeper"); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	payload, _, err = r.BuildLegacy(ctx, clubID)
	return payload, err
}

// ---------------------------------------------------------------------------
// Honours.
// ---------------------------------------------------------------------------

// RecordHonour sets an Honour's progress (monotonic, server-side path).
func (r *Repository) RecordHonour(ctx context.Context, clubID, code string, progress int) error {
	if _, ok := HonourFor(code); !ok {
		return fmt.Errorf("%w: %s", ErrUnknownHonour, code)
	}
	if progress < 0 {
		return ErrInvalidProgress
	}
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if found, err := lockClub(ctx, tx, clubID); err != nil {
			return err
		} else if !found {
			return ErrClubNotFound
		}
		_, err := tx.Exec(ctx, `INSERT INTO "Honours" ("ClubId","Code","Progress","updatedAt")
			VALUES ($1,$2,$3,now())
			ON CONFLICT ("ClubId","Code") DO UPDATE
			SET "Progress" = GREATEST("Honours"."Progress", EXCLUDED."Progress"), "updatedAt" = now()`,
			clubID, code, progress)
		return err
	})
}

// ClaimHonour completes an Honour and grants its reward once (idempotent).
func (r *Repository) ClaimHonour(ctx context.Context, clubID, code string) (map[string]any, error) {
	h, ok := HonourFor(code)
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrUnknownHonour, code)
	}
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if found, err := lockClub(ctx, tx, clubID); err != nil {
			return err
		} else if !found {
			return ErrClubNotFound
		}
		row, found, err := one(ctx, tx, `SELECT "Progress","CompletedAt" FROM "Honours" WHERE "ClubId" = $1 AND "Code" = $2`, clubID, code)
		if err != nil {
			return err
		}
		progress := 0
		if found {
			if row["CompletedAt"] != nil {
				return nil // idempotent: already completed
			}
			progress = intOf(row["Progress"])
		}
		if progress < h.Goal {
			return fmt.Errorf("%w: %s %d/%d", ErrHonourIncomplete, code, progress, h.Goal)
		}
		if !found {
			if _, err := tx.Exec(ctx, `INSERT INTO "Honours" ("ClubId","Code","Progress","CompletedAt","updatedAt")
				VALUES ($1,$2,$3,now(),now())`, clubID, code, progress); err != nil {
				return err
			}
		} else if _, err := tx.Exec(ctx, `UPDATE "Honours" SET "CompletedAt" = now(), "updatedAt" = now()
			WHERE "ClubId" = $1 AND "Code" = $2`, clubID, code); err != nil {
			return err
		}
		return grantHonour(ctx, tx, clubID, h)
	})
	if err != nil {
		return nil, err
	}
	payload, _, err := r.BuildLegacy(ctx, clubID)
	return payload, err
}

func grantHonour(ctx context.Context, q db.Querier, clubID string, h Honour) error {
	rw := h.Reward
	if rw.Cash != 0 || rw.Fans != 0 || rw.SponsorCredits != 0 {
		if _, err := q.Exec(ctx, `UPDATE "Clubs"
			SET "Budget" = coalesce("Budget",0) + $2,
			    "Fans" = coalesce("Fans",0) + $3,
			    "SponsorCredits" = coalesce("SponsorCredits",0) + $4,
			    "updatedAt" = now()
			WHERE "_id" = $1`, clubID, rw.Cash, rw.Fans, rw.SponsorCredits); err != nil {
			return err
		}
		if rw.Cash != 0 {
			if err := ledger(ctx, q, clubID, "season_reward", rw.Cash, "Honour "+h.Code+" cash"); err != nil {
				return err
			}
		}
		if rw.Fans != 0 {
			if err := ledger(ctx, q, clubID, "season_reward", float64(rw.Fans), "Honour "+h.Code+" fans"); err != nil {
				return err
			}
		}
		if rw.SponsorCredits != 0 {
			if err := ledger(ctx, q, clubID, "season_reward", float64(rw.SponsorCredits), "Honour "+h.Code+" credits"); err != nil {
				return err
			}
		}
	}
	if len(rw.Perks) > 0 {
		if err := campus.GrantPerks(ctx, q, clubID, rw.Perks); err != nil {
			return err
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Read model (05 §3 legacy.get / honours.list).
// ---------------------------------------------------------------------------

// BuildLegacy assembles the Club Legacy chain and Honours read model.
func (r *Repository) BuildLegacy(ctx context.Context, clubID string) (map[string]any, bool, error) {
	club, ok, err := one(ctx, r.q, `SELECT "_id","Name","ClubhouseTier" FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil || !ok {
		return nil, ok, err
	}
	stars, err := r.stars(ctx, r.q, clubID)
	if err != nil {
		return nil, false, err
	}
	count, err := groundskeepers(ctx, r.q, clubID, intOf(club["ClubhouseTier"]))
	if err != nil {
		return nil, false, err
	}
	steps := make([]any, 0, len(Chain))
	for _, s := range Chain {
		progress := stars[s.ID]
		steps = append(steps, map[string]any{
			"id":       s.ID,
			"stars":    s.Stars,
			"progress": progress,
			"met":      Met(s, stars),
		})
	}
	honours, err := r.honourPayload(ctx, r.q, clubID)
	if err != nil {
		return nil, false, err
	}
	return map[string]any{
		"clubId":     clubID,
		"name":       db.StringField(club, "Name"),
		"chain":      steps,
		"totalStars": TotalStars(stars),
		"maxStars":   MaxStars(),
		"complete":   Complete(stars),
		"granted":    Granted(stars),
		"groundskeepers": map[string]any{
			"count": count,
			"max":   campus.MaxGroundskeepers,
		},
		"honours": honours,
	}, true, nil
}

// BuildHonours is the honours.list read model (the chain is omitted).
func (r *Repository) BuildHonours(ctx context.Context, clubID string) (map[string]any, bool, error) {
	club, ok, err := one(ctx, r.q, `SELECT "_id","Name" FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil || !ok {
		return nil, ok, err
	}
	honours, err := r.honourPayload(ctx, r.q, clubID)
	if err != nil {
		return nil, false, err
	}
	return map[string]any{
		"clubId":  clubID,
		"name":    db.StringField(club, "Name"),
		"honours": honours,
	}, true, nil
}

func (r *Repository) honourPayload(ctx context.Context, q db.Querier, clubID string) ([]any, error) {
	rows, err := q.Query(ctx, `SELECT "Code","Progress","CompletedAt" FROM "Honours" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	byCode := make(map[string]map[string]any, len(list))
	for _, m := range list {
		byCode[db.StringField(m, "Code")] = m
	}
	out := make([]any, 0, len(Honours))
	for _, h := range Honours {
		row := byCode[h.Code]
		progress := 0
		completed := false
		if row != nil {
			progress = intOf(row["Progress"])
			completed = row["CompletedAt"] != nil
		}
		var perk map[string]any
		if len(h.Reward.Perks) > 0 {
			perk = map[string]any{}
			for _, id := range sortedKeys(h.Reward.Perks) {
				perk[id] = h.Reward.Perks[id]
			}
		}
		out = append(out, map[string]any{
			"code":      h.Code,
			"title":     h.Title,
			"goal":      h.Goal,
			"progress":  progress,
			"complete":  progress >= h.Goal,
			"completed": completed,
			"reward": map[string]any{
				"cash":           h.Reward.Cash,
				"fans":           h.Reward.Fans,
				"sponsorCredits": h.Reward.SponsorCredits,
				"perks":          perk,
			},
		})
	}
	return out, nil
}

func sortedKeys(m map[string]int) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
