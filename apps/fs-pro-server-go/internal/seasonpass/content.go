package seasonpass

import "strconv"

// This file is the season *content*: the monthly objective catalogue (individual
// and shared), the Silver/Gold tier rewards and the Board Perk catalogue
// (docs/coc-mapping/04 §6, §7). Every function here is pure, so the numbers and
// gating are table-testable; the repository seeds these into SeasonObjectives/
// SeasonTiers and reads them back for the claim flow.

// Metric names the server-side source that evaluates an objective. Completion is
// always computed from the database (never trusted from the client), so a claim
// cannot be forged.
type Metric string

// Objective metrics. `associationStars` is the "shared" (Association-wide)
// source (02 §G); the rest are individual.
const (
	MetricClubhouseTier    Metric = "clubhouseTier"
	MetricGroundskeepers   Metric = "groundskeepers"
	MetricRaidWins         Metric = "raidWins"
	MetricRaidStars        Metric = "raidStars"
	MetricHonours          Metric = "honours"
	MetricAssociationStars Metric = "associationStars"
)

// ObjectiveScope distinguishes an individual task from a shared (Association)
// one (04 §6). Shared objectives credit the claiming club's points.
type ObjectiveScope string

// Objective scopes.
const (
	ScopeIndividual ObjectiveScope = "individual"
	ScopeShared     ObjectiveScope = "shared"
)

// Objective is one monthly task. Points flow into the objective-point total that
// drives the tier (TierForPoints). Goal is the metric value that completes it.
type Objective struct {
	Code   string
	Title  string
	Points int
	Goal   int
	Scope  ObjectiveScope
	Metric Metric
}

// Objectives is the season objective catalogue (content - tunable). Order is the
// canonical ordinal used in SeasonClaims.Tier (1-based) so a claim is unique per
// (club, season, objective).
var Objectives = []Objective{
	{Code: "season-kickoff", Title: "Win your first ranked raid", Points: 250, Goal: 1, Scope: ScopeIndividual, Metric: MetricRaidWins},
	{Code: "raid-wins-5", Title: "Win 5 ranked raids", Points: 400, Goal: 5, Scope: ScopeIndividual, Metric: MetricRaidWins},
	{Code: "raid-stars-15", Title: "Earn 15 raid stars", Points: 350, Goal: 15, Scope: ScopeIndividual, Metric: MetricRaidStars},
	{Code: "raid-wins-20", Title: "Win 20 ranked raids", Points: 700, Goal: 20, Scope: ScopeIndividual, Metric: MetricRaidWins},
	{Code: "clubhouse-tier-2", Title: "Reach Clubhouse tier 2", Points: 300, Goal: 2, Scope: ScopeIndividual, Metric: MetricClubhouseTier},
	{Code: "clubhouse-tier-3", Title: "Reach Clubhouse tier 3", Points: 450, Goal: 3, Scope: ScopeIndividual, Metric: MetricClubhouseTier},
	{Code: "builders-4", Title: "Own 4 Groundskeepers", Points: 350, Goal: 4, Scope: ScopeIndividual, Metric: MetricGroundskeepers},
	{Code: "honours-3", Title: "Earn 3 Club Honours", Points: 300, Goal: 3, Scope: ScopeIndividual, Metric: MetricHonours},
	{Code: "assoc-stars-10", Title: "Score 10 stars for your Association", Points: 500, Goal: 10, Scope: ScopeShared, Metric: MetricAssociationStars},
}

// ObjectiveFor resolves an objective by code or by its 1-based ordinal (the
// string form used in the claims table). ok is false for anything else.
func ObjectiveFor(id string) (Objective, bool) {
	for _, o := range Objectives {
		if o.Code == id {
			return o, true
		}
	}
	if n, err := strconv.Atoi(id); err == nil && n >= 1 && n <= len(Objectives) {
		return Objectives[n-1], true
	}
	return Objective{}, false
}

// ObjectiveOrdinal is the 1-based catalogue position of an objective code (0
// when unknown).
func ObjectiveOrdinal(code string) int {
	for i, o := range Objectives {
		if o.Code == code {
			return i + 1
		}
	}
	return 0
}

// ObjectiveByOrdinal returns the objective at a 1-based catalogue position.
func ObjectiveByOrdinal(n int) (Objective, bool) {
	if n < 1 || n > len(Objectives) {
		return Objective{}, false
	}
	return Objectives[n-1], true
}

// ---------------------------------------------------------------------------
// Tier rewards (Silver free / Gold paid). TierThresholds (seasonpass.go) is the
// points table; these are the currency + Perk rewards per tier.
// ---------------------------------------------------------------------------

// Reward is a tier's grant. Currency flows through the TransferLedger; Perks go
// into the club's Clubs.Perks inventory (campus.GrantPerks, never stealable,
// 04 §7).
type Reward struct {
	Cash           float64
	Fans           int
	ScoutTokens    int
	SponsorCredits int
	Perks          map[string]int
}

// IsZero reports whether the reward grants nothing.
func (r Reward) IsZero() bool {
	return r.Cash == 0 && r.Fans == 0 && r.ScoutTokens == 0 && r.SponsorCredits == 0 && len(r.Perks) == 0
}

// Board Perk ids (04 §7, the Magic-Item categories). The keys match the campus
// consumable registry (internal/campus.Perks), which is the single Clubs.Perks
// inventory these reward paths populate.
const (
	PerkResourceCache  = "resource_cache"
	PerkInstantFinish  = "instant_finish"
	PerkBuilderBoost   = "builder_boost"
	PerkResearchFinish = "research_finish"
	PerkTraitTrial     = "trait_trial"
	PerkRegalia        = "regalia"
)

// PerkDef is one Board Perk.
type PerkDef struct {
	ID       string
	Name     string
	Category string
}

// Perks is the Board Perk catalogue (content - tunable).
var Perks = []PerkDef{
	{ID: PerkResourceCache, Name: "Resource Cache", Category: "resource"},
	{ID: PerkInstantFinish, Name: "Instant Finish", Category: "construction"},
	{ID: PerkBuilderBoost, Name: "Builder Boost", Category: "construction"},
	{ID: PerkResearchFinish, Name: "Research Finish", Category: "research"},
	{ID: PerkTraitTrial, Name: "Trait Trial", Category: "combat"},
	{ID: PerkRegalia, Name: "Club Regalia", Category: "cosmetic"},
}

// PerkDefFor resolves a perk by id.
func PerkDefFor(id string) (PerkDef, bool) {
	for _, p := range Perks {
		if p.ID == id {
			return p, true
		}
	}
	return PerkDef{}, false
}

// SilverReward is the free-track reward for a tier (content - tunable).
func SilverReward(tier int) Reward {
	if tier < 1 {
		return Reward{}
	}
	r := Reward{Cash: float64(5000 * tier), Fans: 1000 * tier}
	if tier%4 == 0 {
		r.Perks = map[string]int{PerkResourceCache: 1}
	}
	return r
}

// GoldReward is the paid-track reward for a tier (content - tunable). It is
// strictly richer than Silver and grants premium Sponsor Credits + Perks, but
// never power (04 §9).
func GoldReward(tier int) Reward {
	if tier < 1 {
		return Reward{}
	}
	r := Reward{Cash: float64(10000 * tier), Fans: 2500 * tier, ScoutTokens: 5 * tier}
	if tier%5 == 0 {
		r.SponsorCredits = 100
	}
	perks := map[string]int{}
	if tier%2 == 0 {
		perks[PerkInstantFinish] = 1
	}
	// A research perk every third tier gives the Gold track the full 04 §7 kind
	// spread (resource + construction + research).
	if tier%3 == 0 {
		perks[PerkResearchFinish] = 1
	}
	if len(perks) > 0 {
		r.Perks = perks
	}
	return r
}

// TierReward returns a tier's reward for a track; ok is false for an unknown
// track (so an unknown track can never be granted - the audited gate).
func TierReward(track Track, tier int) (Reward, bool) {
	switch track {
	case Silver:
		return SilverReward(tier), true
	case Gold:
		return GoldReward(tier), true
	default:
		return Reward{}, false
	}
}

// PassPriceCredits is the Sponsor Credit price of the Gold Season Pass
// (04 §9: premium buys time/identity, not power). Content - tunable.
const PassPriceCredits = 500
