package play

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/grid"
	"fs-pro-server/internal/league"
	"fs-pro-server/internal/loot"
	"fs-pro-server/internal/matchrating"
)

// Async raid & defense resolution (docs/coc-mapping/02 §D/§D2/§E, 04 §4.1/§5,
// 05 §4). A raid is queued durably, then resolved: the sim plays the attacker's
// squad (Match grid + Manager Orders) against the defender's stored Home Grid
// snapshot, the 0-3★ rating is computed, and the raid loot, star bonus, Standing
// and Rest Window are applied. It is idempotent: the once-only "RaidResults"
// row is inserted before any effect, so a crash-and-retry cannot double-apply.

// Simulator runs one sim-service match request. The default is
// clients.SimulateMatch; tests inject a deterministic fake.
type Simulator func(ctx context.Context, request map[string]any) (map[string]any, error)

func defaultSimulator() Simulator { return clients.SimulateMatch }

// WithSimulator replaces the sim runner (tests, or a future sharded runner).
func (r *Repository) WithSimulator(s Simulator) *Repository {
	if s != nil {
		r.simulate = s
	}
	return r
}

// WithClock replaces the repository clock (tests pin it so shield/guard
// timestamps are deterministic).
func (r *Repository) WithClock(now func() time.Time) *Repository {
	if now != nil {
		r.now = now
	}
	return r
}

// WithNotifier replaces the defender notifier.
func (r *Repository) WithNotifier(n Notifier) *Repository {
	if n != nil {
		r.notifier = n
	}
	return r
}

func (r *Repository) clock() time.Time {
	if r.now != nil {
		return r.now().UTC()
	}
	return time.Now().UTC()
}

// Rest Window / Warm-up Guard constants (04 §5.2, §12). Durations are applied to
// absolute UTC timestamps; they are never stored as durations.
const (
	// ShieldMinutes is the Rest Window granted to a raided defender.
	ShieldMinutes = 30
	// GuardMinutes is the Warm-up Guard granted once the Rest Window expires.
	GuardMinutes = 30
	// ShieldDestructionPct is the destruction (0-100) at or above which the
	// defender is shielded: a light raid does not re-shield you.
	ShieldDestructionPct = 30
)

// Defense resolution worker defaults.
const (
	// DefaultDefenseBatch bounds how many pending raids one tick resolves.
	DefaultDefenseBatch = 25
)

// ErrClubNotFoundRaids is a sentinel for the raid/board-vault paths.
var (
	ErrRaidsClubNotFound = errors.New("club not found")
	// ErrBoardVaultEmpty is returned when there is no bonus loot to claim.
	ErrBoardVaultEmpty = errors.New("the Board Vault is empty")
)

// DefenseNotice is the durable message a defender receives about a raid. The
// raid outcome fields (RaidID, loot, Standing) are also the payload of the
// realtime `raid:resolved` event (notifier.go), so a transport does not have to
// re-read the result row.
type DefenseNotice struct {
	RaidID        string
	DefenderID    string
	AttackerID    string
	AttackerName  string
	AttackerCode  string
	FixtureID     string
	AttackerGoals int
	DefenderGoals int
	Stars         int
	Practice      bool
	// Stolen*/Standing* are the raid's applied deltas (zero for practice).
	StolenCash       float64
	StolenFans       int
	StolenTokens     int
	StandingAttacker int
	StandingDefender int
	ShieldUntil      *time.Time
	GuardUntil       *time.Time
}

// Notifier delivers a resolved raid to the defender. The default implementation
// (ClubMessageNotifier) writes a durable ClubMessages row; wiring a realtime
// transport (fs-pro-realtime, topics `club:<id>` / event `raid:resolved`) is
// P7/P10 work (docs/coc-mapping/08 §4) and can implement this interface without
// touching the raid core.
type Notifier interface {
	RaidResolved(ctx context.Context, q db.Querier, notice DefenseNotice) error
}

// ClubMessageNotifier is the default: a durable inbox message. It never fails
// the raid on its own (the summary is already persisted in RaidResults).
type ClubMessageNotifier struct{}

// RaidResolved writes the defender's inbox message (matching Node's
// tellDefender, play.service.ts).
func (ClubMessageNotifier) RaidResolved(ctx context.Context, q db.Querier, n DefenseNotice) error {
	tone := "good"
	title := fmt.Sprintf("%s held firm %d-%d", n.AttackerName, n.DefenderGoals, n.AttackerGoals)
	body := fmt.Sprintf("%s came looking for a scalp and left with nothing. Your saved Home Grid did the job.", n.AttackerName)
	switch {
	case n.Practice:
		tone = "neutral"
		title = fmt.Sprintf("Friendly vs %s", n.AttackerName)
		body = fmt.Sprintf("A practice friendly against %s finished %d-%d. No loot, no Standing, no shield changed.",
			n.AttackerName, n.DefenderGoals, n.AttackerGoals)
	case n.DefenderGoals < n.AttackerGoals:
		tone = "bad"
		title = fmt.Sprintf("%s won %d-%d at your ground", n.AttackerName, n.AttackerGoals, n.DefenderGoals)
		body = "Your saved Home Grid could not hold them. Tweak the lineup or tactics to defend better next time."
		if n.ShieldUntil != nil {
			body += fmt.Sprintf(" You are shielded from matchmaking for %d minutes.", ShieldMinutes)
		}
	case n.DefenderGoals == n.AttackerGoals:
		tone = "neutral"
		title = fmt.Sprintf("Honours even with %s", n.AttackerName)
		body = fmt.Sprintf("%s took a %d-%d draw. Defending never tires the squad.", n.AttackerName, n.DefenderGoals, n.AttackerGoals)
	}
	_, err := db.InsertRow(ctx, q, "ClubMessages", map[string]any{
		"ClubId": n.DefenderID, "Kind": "squad", "Tone": tone,
		"Title": title, "Body": body, "updatedAt": time.Now(),
	})
	return err
}

// RaidRequest is a queued raid.
type RaidRequest struct {
	AttackerID string
	DefenderID string
	// FixtureID, when set, is the fixture the result is written to. Empty and
	// not Practice creates one (the playMatch path); Practice with no fixture
	// produces only a result + notification (02 §D2).
	FixtureID string
	Seed      string
	Watch     bool
	Practice  bool
	// Orders are the attacker's Manager Orders (spell analog, 02 §D). They are
	// merged into the attacker's tactic.
	Orders []any
	// Layout overrides the attacker's stored Match grid for this raid.
	Layout *grid.Grid
	// Effects maps attacking player id -> resolved trait/ability effects
	// (sim-core `RawPlayer.effects`). Authoritative population is P4 Go.
	Effects map[string][]any
}

// RaidRef identifies a queued raid and (when any) its fixture.
type RaidRef struct {
	RaidID    string
	FixtureID string
}

// RaidOutcome is the resolved raid.
type RaidOutcome struct {
	RaidID        string
	FixtureID     string
	Practice      bool
	AttackerID    string
	DefenderID    string
	AttackerGoals int
	DefenderGoals int
	Stars         int
	Dominance     float64
	Destruction   int
	StolenCash    float64
	StolenFans    int
	StolenTokens  int
	SystemBonus   float64
	// StandingAttacker/Defender are the Standing-Point deltas applied.
	StandingAttacker int
	StandingDefender int
	ShieldUntil      *time.Time
	GuardUntil       *time.Time
	AlreadyResolved  bool
	Events           any
	Details          map[string]any
	Frames           any
}

// Summary is the JSON serialisable outcome used in responses and stored results.
func (o *RaidOutcome) Summary() map[string]any {
	var shield, guard any
	if o.ShieldUntil != nil {
		shield = db.ISO8601msUTC(*o.ShieldUntil)
	}
	if o.GuardUntil != nil {
		guard = db.ISO8601msUTC(*o.GuardUntil)
	}
	return map[string]any{
		"raidId":          o.RaidID,
		"fixtureId":       o.FixtureID,
		"practice":        o.Practice,
		"stars":           o.Stars,
		"dominance":       o.Dominance,
		"destruction":     o.Destruction,
		"score":           map[string]any{"you": o.AttackerGoals, "them": o.DefenderGoals},
		"stolen":          map[string]any{"cash": o.StolenCash, "fans": o.StolenFans, "tokens": o.StolenTokens},
		"systemBonus":     o.SystemBonus,
		"standing":        map[string]any{"attacker": o.StandingAttacker, "defender": o.StandingDefender},
		"shieldUntil":     shield,
		"guardUntil":      guard,
		"alreadyResolved": o.AlreadyResolved,
	}
}

// --- pure helpers ----------------------------------------------------------

// destructionPct maps a dominance share in [0,1] to an integer percentage.
func destructionPct(dominance float64) int {
	if dominance < 0 {
		dominance = 0
	}
	if dominance > 1 {
		dominance = 1
	}
	return int(math.Round(dominance * 100))
}

// dominanceFromDetails reads possession + xG from both match sides and returns
// the attacker's (home) dominance (02 §D).
func dominanceFromDetails(details map[string]any) float64 {
	home := mapOf(details["HomeTeamDetails"])
	away := mapOf(details["AwayTeamDetails"])
	return matchrating.Dominance(
		numOf(home["Possession"]), numOf(away["Possession"]),
		numOf(home["XG"]), numOf(away["XG"]),
	)
}

// leagueMultiplierX100 is the attacker's Standing-League loot multiplier (04 §4.2).
func leagueMultiplierX100(standingPoints int) int {
	return int(math.Round(league.LeagueFor(standingPoints).Multiplier * 100))
}

// --- queueing --------------------------------------------------------------

// QueueRaid freezes a raid's sim request and stores it as a pending Raids row.
// The request snapshot includes the defender's Home Grid, so resolution is
// deterministic and the defender snapshot is fixed at raid time (05 §6).
func (r *Repository) QueueRaid(ctx context.Context, req RaidRequest) (*RaidRef, error) {
	if req.AttackerID == "" || req.DefenderID == "" {
		return nil, fmt.Errorf("a raid needs an attacker and a defender")
	}
	if req.AttackerID == req.DefenderID {
		return nil, fmt.Errorf("a club cannot raid itself")
	}
	attacker, ok, err := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, req.AttackerID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrRaidsClubNotFound
	}
	defender, ok, err := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, req.DefenderID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrRaidsClubNotFound
	}

	raidID := randUUID()
	seed := req.Seed
	if seed == "" {
		seed = randUUID()
	}

	fixtureID := req.FixtureID
	if fixtureID == "" && !req.Practice {
		day, err := r.currentDayOf(ctx)
		if err != nil {
			return nil, err
		}
		fx, err := db.InsertRow(ctx, r.q, "Fixtures", map[string]any{
			"Title": fmt.Sprintf("%s vs %s %s", db.StringField(attacker, "Name"), db.StringField(defender, "Name"), matchTitleMark),
			"Home":  db.StringField(attacker, "ClubCode"), "Away": db.StringField(defender, "ClubCode"),
			"HomeTeamId": req.AttackerID, "AwayTeamId": req.DefenderID,
			"Type": "friendly", "Stage": "friendly", "Played": false, "SaveStats": true,
			"SeasonId": nil, "ScheduledDay": day, "updatedAt": r.clock(),
		})
		if err != nil {
			return nil, err
		}
		fixtureID = db.StringField(fx, "_id")
	}

	fixtureTag := fixtureID
	if req.Practice && fixtureTag == "" {
		// Deterministic (seed-derived) so a fixed-seed raid's frozen request is
		// byte-identical run to run (05 §6, replay determinism).
		fixtureTag = "raid-" + seed
	}
	request, err := r.buildRaidRequest(ctx, fixtureTag, seed, attacker, defender, req)
	if err != nil {
		return nil, err
	}
	rawRequest, _ := json.Marshal(request)

	if _, err := r.q.Exec(ctx, `INSERT INTO "Raids"
		("_id","FixtureId","AttackerClubId","DefenderClubId","Seed","Practice","Watch","Status","Request","ResolveAt","createdAt","updatedAt")
		VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8::jsonb,$9,now(),now())`,
		raidID, nullableString2(fixtureID), req.AttackerID, req.DefenderID, seed, req.Practice, req.Watch,
		string(rawRequest), r.clock()); err != nil {
		return nil, err
	}
	return &RaidRef{RaidID: raidID, FixtureID: fixtureID}, nil
}

// discardRaid best-effort deletes a raid this request just queued but could not
// resolve (a weekly-cap refusal inside the raid transaction). Without it the
// pending row would be retried by the defense worker; deleting it avoids a
// stale raid that a later week could otherwise apply. Any fixture already
// created is left unplayed, matching the existing failure behaviour.
func (r *Repository) discardRaid(ctx context.Context, raidID string) {
	_, _ = r.q.Exec(ctx, `DELETE FROM "Raids" WHERE "_id" = $1 AND "Status" = 'pending'`, raidID)
}

// buildRaidRequest builds the frozen sim request: the attacker (home) with its
// Match grid + orders, the defender (away) with its stored Home Grid.
func (r *Repository) buildRaidRequest(ctx context.Context, fixtureTag, seed string, attacker, defender map[string]any, req RaidRequest) (map[string]any, error) {
	attPlayers, err := r.clubPlayers(ctx, req.AttackerID)
	if err != nil {
		return nil, err
	}
	defPlayers, err := r.clubPlayers(ctx, req.DefenderID)
	if err != nil {
		return nil, err
	}
	applyPlayerEffects(attPlayers, req.Effects)

	layoutRepo := r.layoutRepo()
	attTactic := tacticOf(attacker)
	if len(req.Orders) > 0 {
		attTactic["orders"] = req.Orders
	}
	if req.Layout != nil {
		attTactic["slots"] = grid.SimSlots(*req.Layout)
	} else {
		attTactic = withStoredLayout(ctx, layoutRepo, req.AttackerID, grid.Match, attTactic)
	}
	defTactic := withStoredLayout(ctx, layoutRepo, req.DefenderID, grid.Home, tacticOf(defender))
	// KPI: which stored grid slot each side fielded (attacker Match, defender Home).
	recordGridUsage("match")
	recordGridUsage("home")

	clubJSON := func(c map[string]any, players []any, tactic map[string]any) map[string]any {
		return map[string]any{
			"_id": db.StringField(c, "_id"), "Name": db.StringField(c, "Name"),
			"ClubCode": db.StringField(c, "ClubCode"), "ManagerId": nullableString2(db.StringField(c, "ManagerId")),
			"Tactic": tactic, "Players": players, "Lineup": c["Lineup"],
		}
	}
	return map[string]any{
		"fixtureId": fixtureTag, "seed": seed,
		"sides":       map[string]any{"home": req.AttackerID, "away": req.DefenderID},
		"clubs":       []any{clubJSON(attacker, attPlayers, attTactic), clubJSON(defender, defPlayers, defTactic)},
		"tactics":     map[string]any{"home": attTactic, "away": defTactic},
		"fixtureType": "friendly", "stage": "friendly", "isKnockout": false,
		"includeFrames": req.Watch,
	}, nil
}

// applyPlayerEffects attaches resolved trait/ability effects to matching player
// maps (sim-core `RawPlayer.effects`, 07 §1a). The effect items are passed
// through verbatim, so an ability's optional match-context `trigger` (OW-P03)
// rides along and the engine gates the effect's activation.
func applyPlayerEffects(players []any, effects map[string][]any) {
	if len(effects) == 0 {
		return
	}
	for _, p := range players {
		m, _ := p.(map[string]any)
		if m == nil {
			continue
		}
		if e := effects[db.StringField(m, "_id")]; len(e) > 0 {
			m["effects"] = e
		}
	}
}

// --- resolution ------------------------------------------------------------

// ResolveRaid resolves one queued raid in its own transaction. It is idempotent:
// the once-only RaidResults row anchors every effect, so a retry (inline, or a
// worker after a crash) returns the stored outcome without re-applying.
func (r *Repository) ResolveRaid(ctx context.Context, raidID string) (*RaidOutcome, error) {
	var out *RaidOutcome
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		rx := *r
		rx.q = tx
		o, err := rx.resolveRaid(ctx, raidID)
		out = o
		return err
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (r *Repository) resolveRaid(ctx context.Context, raidID string) (*RaidOutcome, error) {
	raid, ok, err := r.one(ctx, `SELECT * FROM "Raids" WHERE "_id" = $1 FOR UPDATE`, raidID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("raid not found")
	}
	// Guard first: an applied raid must never be applied again.
	if prev, ok, err := r.one(ctx, `SELECT * FROM "RaidResults" WHERE "RaidId" = $1`, raidID); err != nil {
		return nil, err
	} else if ok {
		return outcomeFromResult(raid, prev, true), nil
	}
	if db.StringField(raid, "Status") == "resolved" {
		return nil, fmt.Errorf("raid %s is marked resolved but has no result guard", raidID)
	}

	var request map[string]any
	switch v := raid["Request"].(type) {
	case map[string]any:
		request = v
	case string:
		if v != "" {
			if err := json.Unmarshal([]byte(v), &request); err != nil {
				return nil, fmt.Errorf("raid %s has an unreadable request: %w", raidID, err)
			}
		}
	}
	if request == nil {
		return nil, fmt.Errorf("raid %s has no frozen request", raidID)
	}

	match, err := r.simulate(ctx, request)
	if err != nil {
		return nil, err
	}
	details := mapOf(match["Details"])
	if details == nil {
		details = map[string]any{}
	}
	events := match["Events"]
	attackerID := db.StringField(raid, "AttackerClubId")
	defenderID := db.StringField(raid, "DefenderClubId")
	practice, _ := raid["Practice"].(bool)
	watch, _ := raid["Watch"].(bool)
	fixtureID := db.StringField(raid, "FixtureId")

	attGoals, defGoals := intOf(details["HomeTeamScore"]), intOf(details["AwayTeamScore"])
	dominance := dominanceFromDetails(details)
	stars := matchrating.Stars(attGoals, defGoals, dominance, defGoals == 0)
	destruction := destructionPct(dominance)
	now := r.clock()

	// Lock the two clubs in a canonical (id-ascending) order. Acquiring the
	// same two row locks in a stable order is what keeps two concurrent raids
	// that share clubs (A->B and B->A) from deadlocking: whichever transaction
	// grabs the lower id first makes the other wait instead of crossing.
	first, second := attackerID, defenderID
	if second < first {
		first, second = second, first
	}
	var attacker, defender map[string]any
	locked, _, err := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1 FOR UPDATE`, first)
	if err != nil {
		return nil, err
	}
	if first == attackerID {
		attacker = locked
	} else {
		defender = locked
	}
	if second != first {
		locked, _, err = r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1 FOR UPDATE`, second)
		if err != nil {
			return nil, err
		}
		if second == attackerID {
			attacker = locked
		} else {
			defender = locked
		}
	}
	if attacker == nil || defender == nil {
		return nil, ErrRaidsClubNotFound
	}

	out := &RaidOutcome{
		RaidID: raidID, FixtureID: fixtureID, Practice: practice,
		AttackerID: attackerID, DefenderID: defenderID,
		AttackerGoals: attGoals, DefenderGoals: defGoals,
		Stars: stars, Dominance: dominance, Destruction: destruction,
		Events: events, Details: details,
	}
	if watch {
		out.Frames = match["Frames"]
	}

	if !practice {
		// Enforce the weekly ranked-attack allowance *inside* the raid's own
		// transaction (04 §4.3). The FOR UPDATE row lock serialises this read
		// against the counter increment league.RecordRankedRaid writes later in
		// this same transaction, so two concurrent resolutions cannot both
		// observe a spare attack. This is the authoritative fix for the
		// pre-flight TOCTOU; the cheap pre-flight check in PlayMatch is only an
		// early, non-committing refusal.
		if err := checkRankedAttackCap(ctx, r.q, attackerID, now); err != nil {
			return nil, err
		}
		attPts := intOf(attacker["StandingPoints"])
		defPts := intOf(defender["StandingPoints"])
		mult := leagueMultiplierX100(attPts)

		out.StolenCash = float64(loot.RaidLootForStars(int(math.Round(floatOf(defender["Budget"]))), stars, mult, 0))
		out.StolenFans = loot.RaidLootForStars(intOf(defender["Fans"]), stars, mult, 0)
		out.StolenTokens = loot.RaidLootForStars(intOf(defender["ScoutTokens"]), stars, mult, 0)
		bonus := float64(loot.StarBonus(stars, mult))
		out.StandingAttacker = league.StandingDelta(attPts, defPts, stars)
		defStars := matchrating.Stars(defGoals, attGoals, 1-dominance, attGoals == 0)
		out.StandingDefender = league.StandingDelta(defPts, attPts, defStars)
		if destruction >= ShieldDestructionPct {
			t := now.Add(ShieldMinutes * time.Minute)
			out.ShieldUntil = &t
		}

		// The system-paid star bonus lands in the Board Vault, capped by tier.
		capacity := loot.BoardVaultCapacity(intOf(attacker["ClubhouseTier"]))
		existing := r.boardVaultBalance(ctx, attackerID)
		credited := bonus
		if existing+credited > float64(capacity) {
			credited = float64(capacity) - existing
		}
		if credited < 0 {
			credited = 0
		}
		out.SystemBonus = credited

		// Guard row first: it is the idempotency anchor for every effect above.
		tag, err := r.insertRaidResult(ctx, out)
		if err != nil {
			return nil, err
		}
		if tag == 0 {
			prev, _, err := r.one(ctx, `SELECT * FROM "RaidResults" WHERE "RaidId" = $1`, raidID)
			if err != nil {
				return nil, err
			}
			return outcomeFromResult(raid, prev, true), nil
		}

		if err := r.applyRaidEconomy(ctx, out, attacker, defender, existing+credited, now); err != nil {
			return nil, err
		}
	} else {
		tag, err := r.insertRaidResult(ctx, out)
		if err != nil {
			return nil, err
		}
		if tag == 0 {
			prev, _, err := r.one(ctx, `SELECT * FROM "RaidResults" WHERE "RaidId" = $1`, raidID)
			if err != nil {
				return nil, err
			}
			return outcomeFromResult(raid, prev, true), nil
		}
	}

	if fixtureID != "" {
		if err := r.recordRaidFixture(ctx, fixtureID, match, details, attacker, defender, watch); err != nil {
			return nil, err
		}
	}

	// KPI: a fresh ranked/practice raid resolved - count its attacker-perspective
	// outcome and star rating. This is reached only once per raid (the
	// RaidResults guard above returns early on a replay).
	recordRaidOutcome(outcomeOf(attGoals, defGoals))
	recordRaidStars(stars)

	// Durable defender notification (realtime transport is P7/P10).
	if r.notifier != nil {
		if err := r.notifier.RaidResolved(ctx, r.q, DefenseNotice{
			RaidID: raidID, DefenderID: defenderID, AttackerID: attackerID,
			AttackerName: db.StringField(attacker, "Name"), AttackerCode: db.StringField(attacker, "ClubCode"),
			FixtureID: fixtureID, AttackerGoals: attGoals, DefenderGoals: defGoals,
			Stars: stars, Practice: practice,
			StolenCash: out.StolenCash, StolenFans: out.StolenFans, StolenTokens: out.StolenTokens,
			StandingAttacker: out.StandingAttacker, StandingDefender: out.StandingDefender,
			ShieldUntil: out.ShieldUntil, GuardUntil: out.GuardUntil,
		}); err != nil {
			return nil, err
		}
	}

	rawResult, _ := json.Marshal(out.Summary())
	if _, err := r.q.Exec(ctx, `UPDATE "Raids" SET "Status" = 'resolved', "Result" = $2::jsonb, "ResolvedAt" = $3, "updatedAt" = now() WHERE "_id" = $1`,
		raidID, string(rawResult), now); err != nil {
		return nil, err
	}
	return out, nil
}

// insertRaidResult writes the once-only guard row and reports 1 when it was
// inserted, 0 when the raid was already applied (the idempotency kill).
func (r *Repository) insertRaidResult(ctx context.Context, o *RaidOutcome) (int64, error) {
	tag, err := r.q.Exec(ctx, `INSERT INTO "RaidResults"
		("RaidId","AttackerClubId","DefenderClubId","Practice","Stars","AttackerGoals","DefenderGoals","Dominance",
		 "StolenCash","StolenFans","StolenTokens","SystemBonus","StandingAttacker","StandingDefender","ShieldUntil","GuardUntil","ResolvedAt")
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
		ON CONFLICT ("RaidId") DO NOTHING`,
		o.RaidID, o.AttackerID, o.DefenderID, o.Practice, o.Stars, o.AttackerGoals, o.DefenderGoals, o.Dominance,
		o.StolenCash, int64(o.StolenFans), int64(o.StolenTokens), o.SystemBonus, o.StandingAttacker, o.StandingDefender,
		o.ShieldUntil, o.GuardUntil)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// applyRaidEconomy applies the ranked raid's loot, Standing and Rest Window.
func (r *Repository) applyRaidEconomy(ctx context.Context, o *RaidOutcome, attacker, defender map[string]any, newVaultBalance float64, now time.Time) error {
	// Attacker gains.
	if _, err := r.q.Exec(ctx, `UPDATE "Clubs"
		SET "Budget" = coalesce("Budget",0) + $2, "Fans" = coalesce("Fans",0) + $3,
		    "ScoutTokens" = coalesce("ScoutTokens",0) + $4, "StandingPoints" = GREATEST(0, "StandingPoints" + $5),
		    "updatedAt" = now()
		WHERE "_id" = $1`,
		o.AttackerID, o.StolenCash, int64(o.StolenFans), int64(o.StolenTokens), o.StandingAttacker); err != nil {
		return err
	}
	// The system-paid star bonus to the Board Vault, capped.
	if o.SystemBonus > 0 {
		if _, err := r.q.Exec(ctx, `INSERT INTO "BoardVault" ("ClubId","Balance","updatedAt") VALUES ($1,$2,now())
			ON CONFLICT ("ClubId") DO UPDATE SET "Balance" = $2, "updatedAt" = now()`,
			o.AttackerID, newVaultBalance); err != nil {
			return err
		}
	}
	// Defender loses (floored at zero) + Rest Window.
	if _, err := r.q.Exec(ctx, `UPDATE "Clubs"
		SET "Budget" = GREATEST(0, coalesce("Budget",0) - $2),
		    "Fans" = GREATEST(0, coalesce("Fans",0) - $3),
		    "ScoutTokens" = GREATEST(0, coalesce("ScoutTokens",0) - $4),
		    "StandingPoints" = GREATEST(0, "StandingPoints" + $5),
		    "ShieldUntil" = CASE WHEN $6::timestamp IS NULL THEN "ShieldUntil"
		                         ELSE GREATEST("ShieldUntil", $6::timestamp) END,
		    "updatedAt" = now()
		WHERE "_id" = $1`,
		o.DefenderID, o.StolenCash, int64(o.StolenFans), int64(o.StolenTokens), o.StandingDefender,
		o.ShieldUntil); err != nil {
		return err
	}

	// Ledger: one row per currency, both sides (04 §5.1, §10).
	note := fmt.Sprintf("Raid %d★: %s", o.Stars, db.StringField(attacker, "Name"))
	if o.StolenCash > 0 {
		if err := raidLedger(ctx, r.q, o.AttackerID, "", "raid_loot", o.StolenCash, note); err != nil {
			return err
		}
		if err := raidLedger(ctx, r.q, "", o.DefenderID, "raid_loot", o.StolenCash, "Raided by "+db.StringField(attacker, "Name")); err != nil {
			return err
		}
	}
	if o.StolenFans > 0 {
		if err := raidLedger(ctx, r.q, o.AttackerID, "", "raid_loot", float64(o.StolenFans), note+" (fans)"); err != nil {
			return err
		}
		if err := raidLedger(ctx, r.q, "", o.DefenderID, "raid_loot", float64(o.StolenFans), "Fans raided by "+db.StringField(attacker, "Name")); err != nil {
			return err
		}
	}
	if o.StolenTokens > 0 {
		if err := raidLedger(ctx, r.q, o.AttackerID, "", "raid_loot", float64(o.StolenTokens), note+" (tokens)"); err != nil {
			return err
		}
		if err := raidLedger(ctx, r.q, "", o.DefenderID, "raid_loot", float64(o.StolenTokens), "Scout Tokens raided by "+db.StringField(attacker, "Name")); err != nil {
			return err
		}
	}
	if o.SystemBonus > 0 {
		if err := raidLedger(ctx, r.q, o.AttackerID, "", "form_bonus", o.SystemBonus, "Board Vault star bonus"); err != nil {
			return err
		}
	}
	// P6: accrue the weekly ladder — the attacker's Form Bonus window and both
	// clubs' pool counters. Runs after the once-only RaidResults guard above, so
	// it cannot double-apply (04 §4.3, §5.3).
	if err := league.RecordRankedRaid(ctx, r.q, o.RaidID, o.AttackerID, o.DefenderID, o.Stars, now); err != nil {
		return err
	}
	return nil
}

func raidLedger(ctx context.Context, q db.Querier, buyer, seller, typ string, amount float64, note string) error {
	data := map[string]any{"Type": typ, "Amount": amount, "Note": note, "updatedAt": time.Now()}
	if buyer != "" {
		data["BuyerClubId"] = buyer
	}
	if seller != "" {
		data["SellerClubId"] = seller
	}
	_, err := db.InsertRow(ctx, q, "TransferLedger", data)
	return err
}

// recordRaidFixture writes the fixture result (and, when watching, the replay).
func (r *Repository) recordRaidFixture(ctx context.Context, fixtureID string, match, details map[string]any, attacker, defender map[string]any, watch bool) error {
	rawDetails, _ := json.Marshal(details)
	rawEvents, _ := json.Marshal(match["Events"])
	if _, err := r.q.Exec(ctx, `UPDATE "Fixtures" SET "Played" = true, "Details" = $2::jsonb, "Events" = $3::jsonb,
		"PlayedAt" = now(), "updatedAt" = now() WHERE "_id" = $1`,
		fixtureID, string(rawDetails), string(rawEvents)); err != nil {
		return err
	}
	if !watch {
		return nil
	}
	homeRef := map[string]any{"id": db.StringField(attacker, "_id"), "name": db.StringField(attacker, "Name"), "code": db.StringField(attacker, "ClubCode")}
	awayRef := map[string]any{"id": db.StringField(defender, "_id"), "name": db.StringField(defender, "Name"), "code": db.StringField(defender, "ClubCode")}
	_, err := r.q.Exec(ctx, `INSERT INTO "MatchReplays" ("FixtureId","Home","Away","Frames","Details","TickMs","updatedAt")
		VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6,now())
		ON CONFLICT ("FixtureId") DO UPDATE SET "Home" = EXCLUDED."Home", "Away" = EXCLUDED."Away",
		  "Frames" = EXCLUDED."Frames", "Details" = EXCLUDED."Details", "TickMs" = EXCLUDED."TickMs", "updatedAt" = now()`,
		fixtureID, jsonArg(homeRef), jsonArg(awayRef), jsonArg(match["Frames"]), jsonArg(details), 300)
	return err
}

func (r *Repository) boardVaultBalance(ctx context.Context, clubID string) float64 {
	row, ok, err := r.one(ctx, `SELECT "Balance" FROM "BoardVault" WHERE "ClubId" = $1`, clubID)
	if err != nil || !ok {
		return 0
	}
	return floatOf(row["Balance"])
}

// clubhouseTier reads the club's Clubhouse tier (min 1), used to validate a
// one-match layout override at the attacker's tier.
func (r *Repository) clubhouseTier(ctx context.Context, clubID string) (int, error) {
	row, ok, err := r.one(ctx, `SELECT "ClubhouseTier" FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil {
		return 1, err
	}
	if !ok {
		return 1, ErrRaidsClubNotFound
	}
	tier := intOf(row["ClubhouseTier"])
	if tier < 1 {
		tier = 1
	}
	return tier, nil
}

// outcomeFromResult rebuilds an outcome from the stored guard row.
func outcomeFromResult(raid, res map[string]any, already bool) *RaidOutcome {
	o := &RaidOutcome{
		RaidID:           db.StringField(raid, "_id"),
		FixtureID:        db.StringField(raid, "FixtureId"),
		Practice:         boolOf(res["Practice"]),
		AttackerID:       db.StringField(res, "AttackerClubId"),
		DefenderID:       db.StringField(res, "DefenderClubId"),
		Stars:            intOf(res["Stars"]),
		AttackerGoals:    intOf(res["AttackerGoals"]),
		DefenderGoals:    intOf(res["DefenderGoals"]),
		Dominance:        floatOf(res["Dominance"]),
		StolenCash:       floatOf(res["StolenCash"]),
		StolenFans:       intOf(res["StolenFans"]),
		StolenTokens:     intOf(res["StolenTokens"]),
		SystemBonus:      floatOf(res["SystemBonus"]),
		StandingAttacker: intOf(res["StandingAttacker"]),
		StandingDefender: intOf(res["StandingDefender"]),
		AlreadyResolved:  already,
	}
	o.Destruction = destructionPct(o.Dominance)
	if t, ok := parseTimestamp(res["ShieldUntil"]); ok {
		o.ShieldUntil = &t
	}
	if t, ok := parseTimestamp(res["GuardUntil"]); ok {
		o.GuardUntil = &t
	}
	return o
}

func parseTimestamp(v any) (time.Time, bool) {
	s := db.StringField(map[string]any{"t": v}, "t")
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{"2006-01-02T15:04:05.000Z", time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}

// claimPendingRaidsSQL claims a batch of due raids for resolution. It projects
// the attacker/defender club ids as well as the raid id because
// ResolvePendingRaids pre-locks every club in the batch (in id-ascending order)
// before resolving any raid; without the club columns that pre-lock sees no
// clubs and concurrent batches deadlock on shared club rows.
const claimPendingRaidsSQL = `SELECT "_id", "AttackerClubId", "DefenderClubId" FROM "Raids"
	WHERE "Status" = 'pending' AND "ResolveAt" <= $1
	ORDER BY "ResolveAt", "createdAt" LIMIT $2 FOR UPDATE SKIP LOCKED`

// ResolvePendingRaids resolves up to `limit` due pending raids (the offline
// defense path). Each raid is its own savepoint, so one failure does not abort
// the tick; a failing raid is marked 'failed' so it is not retried forever.
func ResolvePendingRaids(ctx context.Context, q db.Querier, now time.Time, sim Simulator, limit int) (int, error) {
	if limit <= 0 {
		limit = DefaultDefenseBatch
	}
	rows, err := q.Query(ctx, claimPendingRaidsSQL, now, limit)
	if err != nil {
		return 0, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return 0, err
	}
	repo := NewRepository(q)
	if sim != nil {
		repo.simulate = sim
	}
	// Pre-lock every club this batch touches — one row at a time, in id-ascending
	// order — before resolving any raid. resolveRaid holds a club's row lock until
	// the enclosing batch transaction commits, so two concurrent batches that
	// share a club would otherwise take those locks in per-raid order and
	// deadlock (a lock-order inversion). Acquiring the whole batch's clubs in one
	// globally-consistent order makes every batch lock in the same sequence, so
	// concurrent drains serialise instead of cycling. The later per-raid
	// FOR UPDATE reads are then re-entrant no-ops for this transaction.
	for _, clubID := range batchClubIDs(list) {
		if _, _, err := repo.one(ctx, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1 FOR UPDATE`, clubID); err != nil {
			return 0, err
		}
	}
	resolved := 0
	for _, row := range list {
		id := db.StringField(row, "_id")
		if _, err := repo.ResolveRaid(ctx, id); err != nil {
			recordDefenseFailure()
			if _, uerr := q.Exec(ctx, `UPDATE "Raids" SET "Status" = 'failed', "updatedAt" = now() WHERE "_id" = $1`, id); uerr != nil {
				return resolved, uerr
			}
			continue
		}
		recordRaidResolution("defense")
		resolved++
	}
	return resolved, nil
}

// batchClubIDs returns the distinct attacker/defender club ids in a claimed
// batch, sorted ascending so every concurrent batch acquires club row locks in
// the same order (see ResolvePendingRaids).
func batchClubIDs(raids []map[string]any) []string {
	seen := make(map[string]struct{}, len(raids)*2)
	out := make([]string, 0, len(raids)*2)
	for _, r := range raids {
		for _, key := range [2]string{"AttackerClubId", "DefenderClubId"} {
			id := db.StringField(r, key)
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}

// ExpireShields turns every lapsed Rest Window into a Warm-up Guard, then clears
// the shield (04 §5.2, 05 §4). It is idempotent: the guard is set once and the
// shield cleared, so a second tick changes nothing.
func ExpireShields(ctx context.Context, q db.Querier, now time.Time) (int64, error) {
	tag, err := q.Exec(ctx, `UPDATE "Clubs"
		SET "GuardUntil" = "ShieldUntil" + ($2::int * interval '1 minute'),
		    "ShieldUntil" = NULL, "updatedAt" = now()
		WHERE "ShieldUntil" IS NOT NULL AND "ShieldUntil" <= $1
		  AND ("GuardUntil" IS NULL OR "GuardUntil" < "ShieldUntil")`, now, GuardMinutes)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// --- Board Vault claim -----------------------------------------------------
// ClaimBoardVault moves the whole protected Board Vault into Cash (Budget) with
// a ledger row. It is a guarded transaction: a second claim finds an empty vault
// and returns ErrBoardVaultEmpty (409).
func (r *Repository) ClaimBoardVault(ctx context.Context, clubID string) (map[string]any, error) {
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		club, ok, err := txOne(ctx, tx, `SELECT "_id","Budget","ClubhouseTier" FROM "Clubs" WHERE "_id" = $1 FOR UPDATE`, clubID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrRaidsClubNotFound
		}
		row, ok, err := txOne(ctx, tx, `SELECT "Balance" FROM "BoardVault" WHERE "ClubId" = $1 FOR UPDATE`, clubID)
		if err != nil {
			return err
		}
		balance := 0.0
		if ok {
			balance = floatOf(row["Balance"])
		}
		if balance <= 0 {
			return ErrBoardVaultEmpty
		}
		tag, err := tx.Exec(ctx, `UPDATE "BoardVault" SET "Balance" = 0, "updatedAt" = now() WHERE "ClubId" = $1 AND "Balance" > 0`, clubID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrBoardVaultEmpty
		}
		rows, err := tx.Query(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) + $2, "updatedAt" = now() WHERE "_id" = $1 RETURNING "Budget"`, clubID, balance)
		if err != nil {
			return err
		}
		updated, _, err := db.ScanOne(rows)
		if err != nil {
			return err
		}
		if err := raidLedger(ctx, tx, clubID, "", "form_bonus", balance, "Board Vault claim"); err != nil {
			return err
		}
		// Consume the Form Bonus "ready" flag alongside the vault claim (04 §5.3).
		if err := league.ClearFormBonusEarned(ctx, tx, clubID); err != nil {
			return err
		}
		budget := floatOf(club["Budget"]) + balance
		if updated != nil {
			budget = floatOf(updated["Budget"])
		}
		out = map[string]any{
			"claimed": balance,
			"budget":  budget,
			"vault": map[string]any{
				"balance":  0,
				"capacity": loot.BoardVaultCapacity(intOf(club["ClubhouseTier"])),
			},
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// DefenseLog is the defender's recent raid results, newest first.
func (r *Repository) DefenseLog(ctx context.Context, clubID string, limit int) (map[string]any, error) {
	if limit <= 0 {
		limit = 20
	}
	if _, ok, err := r.one(ctx, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1`, clubID); err != nil {
		return nil, err
	} else if !ok {
		return nil, ErrRaidsClubNotFound
	}
	rows, err := r.q.Query(ctx, `SELECT r."RaidId", r."Stars", r."AttackerGoals", r."DefenderGoals", r."StolenCash", r."StolenFans", r."StolenTokens",
		r."ShieldUntil", r."GuardUntil", r."ResolvedAt", r."AttackerClubId", r."Practice",
		a."Name" AS "AttackerName", a."ClubCode" AS "AttackerCode"
		FROM "RaidResults" r JOIN "Clubs" a ON a."_id" = r."AttackerClubId"
		WHERE r."DefenderClubId" = $1 ORDER BY r."ResolvedAt" DESC LIMIT $2`, clubID, limit)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	defenses := make([]any, 0, len(list))
	for _, row := range list {
		you, them := intOf(row["DefenderGoals"]), intOf(row["AttackerGoals"])
		var shield, guard any
		if s := db.StringField(row, "ShieldUntil"); s != "" {
			shield = s
		}
		if s := db.StringField(row, "GuardUntil"); s != "" {
			guard = s
		}
		defenses = append(defenses, map[string]any{
			"raidId":       db.StringField(row, "RaidId"),
			"attackerId":   db.StringField(row, "AttackerClubId"),
			"attackerName": db.StringField(row, "AttackerName"),
			"attackerCode": db.StringField(row, "AttackerCode"),
			"practice":     boolOf(row["Practice"]),
			"score":        map[string]any{"you": you, "them": them},
			"outcome":      outcomeFor(you, them),
			"stars":        intOf(row["Stars"]),
			"lootLost": map[string]any{
				"cash":   floatOf(row["StolenCash"]),
				"fans":   intOf(row["StolenFans"]),
				"tokens": intOf(row["StolenTokens"]),
			},
			"shieldUntil": shield,
			"guardUntil":  guard,
			"resolvedAt":  db.StringField(row, "ResolvedAt"),
		})
	}
	return map[string]any{"defenses": defenses, "now": db.ISO8601msUTC(r.clock())}, nil
}

func txOne(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// checkRankedAttackCap enforces the weekly ranked-attack allowance within the
// caller's transaction (04 §4.3). It reads the attacker's StandingPools row FOR
// UPDATE, so this read is serialised against the increment
// league.RecordRankedRaid writes later in the same transaction: a second
// concurrent resolution blocks on the row lock, re-reads the incremented count
// and is refused. A club not signed up this week has no row and no cap.
func checkRankedAttackCap(ctx context.Context, q db.Querier, clubID string, now time.Time) error {
	row, ok, err := txOne(ctx, q, `SELECT "LeagueCode", "Attacks" FROM "StandingPools"
		WHERE "WeekKey" = $1 AND "ClubId" = $2 FOR UPDATE`, league.WeekKey(now), clubID)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	allowed := league.AttacksPerPool(league.LeagueByCode(db.StringField(row, "LeagueCode")))
	if intOf(row["Attacks"]) >= allowed {
		return PlayGateError{weeklyAttackCapMessage(allowed)}
	}
	return nil
}
