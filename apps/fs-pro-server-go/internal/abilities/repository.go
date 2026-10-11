package abilities

import (
	"context"
	"errors"
	"fmt"

	"fs-pro-server/internal/db"
)

// The abilities store (P4 Go): slotted abilities, mastery XP, equipped traits
// and the War Room order inventory. Reads use the column-keyed map passthrough;
// every mutation runs in a transaction, and the two mutations that move a
// currency or alloys write a TransferLedger row and are guarded so a racing
// request cannot overdraw (matches internal/campus).

// Sentinel errors the handlers map to HTTP statuses. Named after the condition,
// not the status.
var (
	ErrClubNotFound       = errors.New("club not found")
	ErrPlayerNotFound     = errors.New("player not found")
	ErrUnknownAbility     = errors.New("unknown ability")
	ErrUnknownTrait       = errors.New("unknown trait")
	ErrUnknownOrder       = errors.New("unknown order")
	ErrFamilyMismatch     = errors.New("ability is not available to this player")
	ErrFacilityGate       = errors.New("coaching tier too low")
	ErrMasteryGate        = errors.New("ability mastery too low")
	ErrSlotCap            = errors.New("no free ability slots")
	ErrInvalidSlot        = errors.New("invalid trait slot")
	ErrInsufficientFunds  = errors.New("insufficient funds")
	ErrInsufficientAlloys = errors.New("insufficient trait alloys")
	ErrTraitNotEquipped   = errors.New("trait is not equipped")
	ErrMaxRarity          = errors.New("trait is already at maximum rarity")
	ErrInvalidCount       = errors.New("invalid order count")
	ErrInvalidXp          = errors.New("invalid mastery xp")
)

// MasteryEntry is one PlayerMastery row resolved to a tier.
type MasteryEntry struct {
	Ability string
	Xp      int
	Tier    int
}

// SlottedAbility is one PlayerAbilities row.
type SlottedAbility struct {
	Ability string
	Slot    int
}

// EquippedTraitRow is one PlayerTraits row.
type EquippedTraitRow struct {
	Trait  string
	Slot   int
	Rarity Rarity
}

// OrderEntry is one ClubOrders row.
type OrderEntry struct {
	Order string
	Count int
}

// Repository is the pgx-backed abilities/traits/orders store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier for access checks.
func (r *Repository) Q() db.Querier { return r.q }

// ---------------------------------------------------------------------------
// Mastery tier helpers (pure).
// ---------------------------------------------------------------------------

// MasteryTierForAbility is a player's tier in one ability; absent XP is tier 1.
func MasteryTierForAbility(entries []MasteryEntry, abilityID string) int {
	for _, e := range entries {
		if e.Ability == abilityID {
			return MasteryTierForXp(e.Xp)
		}
	}
	return MasteryTierForXp(0)
}

// PlayerMasteryTier is a player's overall mastery tier: the highest ability tier
// they hold, never below 1. It drives the ability slot count (SlotCount).
func PlayerMasteryTier(entries []MasteryEntry) int {
	tier := 1
	for _, e := range entries {
		if t := MasteryTierForXp(e.Xp); t > tier {
			tier = t
		}
	}
	return tier
}

// reasonFor returns an empty string when the ability may be slotted, else a
// clear, client-consumable reason.
func reasonFor(a Ability, family Family, facilityTier, masteryTier int) string {
	if a.Family != FamilyALL && a.Family != family {
		return fmt.Sprintf("%s is a %s-family ability", a.Name, a.Family)
	}
	if a.FacilityTier > facilityTier {
		return fmt.Sprintf("%s needs Coaching tier %d (you have %d)", a.Name, a.FacilityTier, facilityTier)
	}
	if a.MasteryTier > masteryTier {
		return fmt.Sprintf("%s needs %s mastery tier %d (you have %d)", a.Name, a.ID, a.MasteryTier, masteryTier)
	}
	return ""
}

func gateError(a Ability, family Family, facilityTier, masteryTier int) error {
	switch {
	case a.Family != FamilyALL && a.Family != family:
		return fmt.Errorf("%w: %s", ErrFamilyMismatch, a.Name)
	case a.FacilityTier > facilityTier:
		return fmt.Errorf("%w: %s needs Coaching tier %d (you have %d)", ErrFacilityGate, a.Name, a.FacilityTier, facilityTier)
	default:
		return fmt.Errorf("%w: %s needs mastery tier %d (you have %d)", ErrMasteryGate, a.Name, a.MasteryTier, masteryTier)
	}
}

// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

func one(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// Mastery reads every mastery row for a player, canonical order.
func (r *Repository) Mastery(ctx context.Context, playerID string) ([]MasteryEntry, error) {
	rows, err := r.q.Query(ctx, `SELECT "Ability","Xp" FROM "PlayerMastery" WHERE "PlayerId" = $1 ORDER BY "Ability"`, playerID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	return masteryEntries(list), nil
}

// SlottedAbilities reads a player's slotted abilities, slot order.
func (r *Repository) SlottedAbilities(ctx context.Context, playerID string) ([]SlottedAbility, error) {
	rows, err := r.q.Query(ctx, `SELECT "Ability","Slot" FROM "PlayerAbilities" WHERE "PlayerId" = $1 ORDER BY "Slot"`, playerID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make([]SlottedAbility, 0, len(list))
	for _, m := range list {
		out = append(out, SlottedAbility{Ability: db.StringField(m, "Ability"), Slot: intOf(m["Slot"])})
	}
	return out, nil
}

// EquippedTraits reads a player's equipped traits, slot order.
func (r *Repository) EquippedTraits(ctx context.Context, playerID string) ([]EquippedTraitRow, error) {
	rows, err := r.q.Query(ctx, `SELECT "Trait","Slot","Rarity" FROM "PlayerTraits" WHERE "PlayerId" = $1 ORDER BY "Slot"`, playerID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make([]EquippedTraitRow, 0, len(list))
	for _, m := range list {
		out = append(out, EquippedTraitRow{
			Trait:  db.StringField(m, "Trait"),
			Slot:   intOf(m["Slot"]),
			Rarity: NormalizeRarity(Rarity(db.StringField(m, "Rarity"))),
		})
	}
	return out, nil
}

// OrderInventory reads a club's War Room stock, canonical order.
func (r *Repository) OrderInventory(ctx context.Context, clubID string) ([]OrderEntry, error) {
	rows, err := r.q.Query(ctx, `SELECT "Order","Count" FROM "ClubOrders" WHERE "ClubId" = $1 ORDER BY "Order"`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make([]OrderEntry, 0, len(list))
	for _, m := range list {
		out = append(out, OrderEntry{Order: db.StringField(m, "Order"), Count: intOf(m["Count"])})
	}
	return out, nil
}

// ClubExists reports whether a club row exists.
func (r *Repository) ClubExists(ctx context.Context, clubID string) (bool, error) {
	_, ok, err := one(ctx, r.q, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1`, clubID)
	return ok, err
}

// playersOfClub returns the club's signed, non-retired players.
func playersOfClub(ctx context.Context, q db.Querier, clubID string) ([]map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT "_id","FirstName","LastName","Position","Role"
		FROM "Players" WHERE "ClubId" = $1 AND "isSigned" = true AND "isRetired" = false
		ORDER BY "createdAt", "_id"`, clubID)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

func facilityLevels(ctx context.Context, q db.Querier, clubID string) (map[string]int, error) {
	rows, err := q.Query(ctx, `SELECT "AssetType","Level" FROM "ClubAssets" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make(map[string]int, len(list))
	for _, m := range list {
		out[db.StringField(m, "AssetType")] = intOf(m["Level"])
	}
	return out, nil
}

func masteryEntries(list []map[string]any) []MasteryEntry {
	out := make([]MasteryEntry, 0, len(list))
	for _, m := range list {
		xp := intOf(m["Xp"])
		out = append(out, MasteryEntry{Ability: db.StringField(m, "Ability"), Xp: xp, Tier: MasteryTierForXp(xp)})
	}
	return out
}

// ---------------------------------------------------------------------------
// Slotting (P4 §7): facility tier + mastery tier + slot cap, with clear reasons.
// ---------------------------------------------------------------------------

// SlotAbility slots an ability on a player. It validates that the player belongs
// to the club, that the ability is in the player's family, that the club's
// Coaching tier and the player's mastery in that ability meet the ability's
// gates, and that an ability slot is free. Re-slotting an already-slotted
// ability is a no-op success (idempotent).
func (r *Repository) SlotAbility(ctx context.Context, clubID, playerID, abilityID string) error {
	a, ok := AbilityByID(abilityID)
	if !ok {
		return ErrUnknownAbility
	}
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		player, ok, err := one(ctx, tx, `SELECT "ClubId","Position","Role" FROM "Players" WHERE "_id" = $1`, playerID)
		if err != nil {
			return err
		}
		if !ok || db.StringField(player, "ClubId") != clubID {
			return ErrPlayerNotFound
		}
		levels, err := facilityLevels(ctx, tx, clubID)
		if err != nil {
			return err
		}
		facilityTier := FacilityTierForResearch(levels[facilityKeyCoaching], levels[facilityKeyVideo])
		family := FamilyForPosition(db.StringField(player, "Position"))

		rows, err := masteryQuery(ctx, tx, playerID)
		if err != nil {
			return err
		}
		entries := masteryEntries(rows)
		if !CanSlot(a, family, facilityTier, MasteryTierForAbility(entries, abilityID)) {
			return gateError(a, family, facilityTier, MasteryTierForAbility(entries, abilityID))
		}

		slotted, err := slottedQuery(ctx, tx, playerID)
		if err != nil {
			return err
		}
		for _, s := range slotted {
			if s.Ability == abilityID {
				return nil // already slotted: idempotent
			}
		}
		capacity := SlotCount(PlayerMasteryTier(entries))
		if len(slotted) >= capacity {
			return fmt.Errorf("%w: mastery tier %d allows %d abilities", ErrSlotCap, PlayerMasteryTier(entries), capacity)
		}
		slot := firstFreeSlot(slotted, capacity)
		if _, err := tx.Exec(ctx, `INSERT INTO "PlayerAbilities" ("PlayerId","Ability","Slot","updatedAt")
			VALUES ($1,$2,$3,now())`, playerID, abilityID, slot); err != nil {
			return err
		}
		return nil
	})
}

// UnslotAbility removes an ability from a player (idempotent).
func (r *Repository) UnslotAbility(ctx context.Context, clubID, playerID, abilityID string) error {
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if err := assertPlayerInClub(ctx, tx, clubID, playerID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM "PlayerAbilities" WHERE "PlayerId" = $1 AND "Ability" = $2`, playerID, abilityID)
		return err
	})
}

// AddMasteryXp adds `xp` to a player's mastery in one ability and returns the
// updated entry. xp must be positive; the ability must be in the registry.
func (r *Repository) AddMasteryXp(ctx context.Context, playerID, abilityID string, xp int) (MasteryEntry, error) {
	var out MasteryEntry
	if _, ok := AbilityByID(abilityID); !ok {
		return out, ErrUnknownAbility
	}
	if xp <= 0 {
		return out, fmt.Errorf("%w: xp must be positive", ErrInvalidXp)
	}
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if _, ok, err := one(ctx, tx, `SELECT "_id" FROM "Players" WHERE "_id" = $1`, playerID); err != nil {
			return err
		} else if !ok {
			return ErrPlayerNotFound
		}
		row, ok, err := one(ctx, tx, `INSERT INTO "PlayerMastery" ("PlayerId","Ability","Xp","updatedAt")
			VALUES ($1,$2,$3,now())
			ON CONFLICT ("PlayerId","Ability") DO UPDATE SET "Xp" = "PlayerMastery"."Xp" + EXCLUDED."Xp", "updatedAt" = now()
			RETURNING "Xp"`, playerID, abilityID, xp)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("mastery upsert returned no row")
		}
		total := intOf(row["Xp"])
		out = MasteryEntry{Ability: abilityID, Xp: total, Tier: MasteryTierForXp(total)}
		return nil
	})
	return out, err
}

// DrillXp is the weekly-drill mastery grant (03 §2.4): it reuses the ability
// mastery grant so drills and matches share one XP curve. It does not touch the
// player-development (attribute) training path, so it cannot regress those
// distributions.
func (r *Repository) DrillXp(ctx context.Context, playerID, abilityID string, xp int) (MasteryEntry, error) {
	return r.AddMasteryXp(ctx, playerID, abilityID, xp)
}

// ---------------------------------------------------------------------------
// Traits (2 slots) and alloy upgrades.
// ---------------------------------------------------------------------------

// EquipTrait equips a trait in a slot (0 or 1). Re-equipping the same trait in
// the same slot is a no-op success; changing the trait resets its rarity to
// Shiny (a fresh copy).
func (r *Repository) EquipTrait(ctx context.Context, clubID, playerID, traitID string, slot int) error {
	if _, ok := TraitByID(traitID); !ok {
		return ErrUnknownTrait
	}
	if slot < 0 || slot >= MaxTraitSlots {
		return fmt.Errorf("%w: %d", ErrInvalidSlot, slot)
	}
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if err := assertPlayerInClub(ctx, tx, clubID, playerID); err != nil {
			return err
		}
		existing, ok, err := one(ctx, tx, `SELECT "Trait" FROM "PlayerTraits" WHERE "PlayerId" = $1 AND "Slot" = $2`, playerID, slot)
		if err != nil {
			return err
		}
		if ok && db.StringField(existing, "Trait") == traitID {
			return nil // idempotent
		}
		_, err = tx.Exec(ctx, `INSERT INTO "PlayerTraits" ("PlayerId","Trait","Slot","Rarity","updatedAt")
			VALUES ($1,$2,$3,'shiny',now())
			ON CONFLICT ("PlayerId","Slot") DO UPDATE SET "Trait" = EXCLUDED."Trait", "Rarity" = 'shiny', "updatedAt" = now()`,
			playerID, traitID, slot)
		return err
	})
}

// UpgradeTrait advances an equipped trait to the next rarity, spending Trait
// Alloys (04 §1). The alloy debit is guarded, and it writes a ledger row.
func (r *Repository) UpgradeTrait(ctx context.Context, clubID, playerID, traitID string) (Rarity, error) {
	var result Rarity
	if _, ok := TraitByID(traitID); !ok {
		return result, ErrUnknownTrait
	}
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if err := assertPlayerInClub(ctx, tx, clubID, playerID); err != nil {
			return err
		}
		row, ok, err := one(ctx, tx, `SELECT "Rarity" FROM "PlayerTraits" WHERE "PlayerId" = $1 AND "Trait" = $2`, playerID, traitID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrTraitNotEquipped
		}
		from := NormalizeRarity(Rarity(db.StringField(row, "Rarity")))
		next, ok := NextRarity(from)
		if !ok {
			return ErrMaxRarity
		}
		cost, _ := AlloyCost(from)
		if err := debitAlloys(ctx, tx, clubID, cost); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE "PlayerTraits" SET "Rarity" = $3, "updatedAt" = now()
			WHERE "PlayerId" = $1 AND "Trait" = $2`, playerID, traitID, string(next)); err != nil {
			return err
		}
		if err := ledger(ctx, tx, clubID, "trait_alloy", float64(cost.Shiny+cost.Glowy+cost.Starry),
			fmt.Sprintf("%s -> %s", traitID, next)); err != nil {
			return err
		}
		result = next
		return nil
	})
	return result, err
}

// ---------------------------------------------------------------------------
// War Room order inventory (02 §D).
// ---------------------------------------------------------------------------

// PrepareOrder stocks `target` copies of an order in the War Room, spending the
// Fans difference from the current stock. Calling it again with the same target
// is a no-op (idempotent); reducing stock is a no-op too, so a retried request
// can never double-spend.
func (r *Repository) PrepareOrder(ctx context.Context, clubID, orderID string, target int) (OrderEntry, error) {
	var out OrderEntry
	o, ok := OrderByID(orderID)
	if !ok {
		return out, ErrUnknownOrder
	}
	if target < 0 || target > MaxOrderCount {
		return out, fmt.Errorf("%w: stock must be 0..%d", ErrInvalidCount, MaxOrderCount)
	}
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if _, ok, err := one(ctx, tx, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1`, clubID); err != nil {
			return err
		} else if !ok {
			return ErrClubNotFound
		}
		current := 0
		if row, ok, err := one(ctx, tx, `SELECT "Count" FROM "ClubOrders" WHERE "ClubId" = $1 AND "Order" = $2`, clubID, orderID); err != nil {
			return err
		} else if ok {
			current = intOf(row["Count"])
		}
		out = OrderEntry{Order: orderID, Count: current}
		delta := target - current
		if delta <= 0 {
			return nil // idempotent / no reduction
		}
		cost := float64(delta * o.Cost)
		tag, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Fans" = coalesce("Fans",0) - $2, "updatedAt" = now()
			WHERE "_id" = $1 AND coalesce("Fans",0) >= $2`, clubID, int64(delta*o.Cost))
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrInsufficientFunds
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubOrders" ("ClubId","Order","Count","updatedAt")
			VALUES ($1,$2,$3,now())
			ON CONFLICT ("ClubId","Order") DO UPDATE SET "Count" = EXCLUDED."Count", "updatedAt" = now()`,
			clubID, orderID, target); err != nil {
			return err
		}
		if err := ledger(ctx, tx, clubID, "order", cost, fmt.Sprintf("%s x%d", o.Name, target)); err != nil {
			return err
		}
		out = OrderEntry{Order: orderID, Count: target}
		return nil
	})
	return out, err
}

// ---------------------------------------------------------------------------
// Read model: the club's ability/mastery screen (05 §3 abilities.list).
// ---------------------------------------------------------------------------

// BuildClubAbilities assembles the per-player ability screen: the club's
// Coaching tier, the registry, and for each player their family, mastery tier,
// slot usage, slotted abilities and the family syllabus with eligibility.
func (r *Repository) BuildClubAbilities(ctx context.Context, clubID string) (map[string]any, bool, error) {
	club, ok, err := one(ctx, r.q, `SELECT "_id","Name","ClubhouseTier" FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil || !ok {
		return nil, ok, err
	}
	levels, err := facilityLevels(ctx, r.q, clubID)
	if err != nil {
		return nil, false, err
	}
	facilityTier := FacilityTierForResearch(levels[facilityKeyCoaching], levels[facilityKeyVideo])

	players, err := playersOfClub(ctx, r.q, clubID)
	if err != nil {
		return nil, false, err
	}

	mastery, err := clubMastery(ctx, r.q, clubID)
	if err != nil {
		return nil, false, err
	}
	slotted, err := clubSlotted(ctx, r.q, clubID)
	if err != nil {
		return nil, false, err
	}

	playerList := make([]any, 0, len(players))
	for _, p := range players {
		pid := db.StringField(p, "_id")
		entries := mastery[pid]
		family := FamilyForPosition(db.StringField(p, "Position"))
		playerTier := PlayerMasteryTier(entries)
		slots := SlotCount(playerTier)

		slottedList := make([]any, 0, len(slotted[pid]))
		for _, s := range slotted[pid] {
			item := map[string]any{"abilityId": s.Ability, "slot": s.Slot,
				"xp": 0, "masteryTier": 1}
			if a, ok := AbilityByID(s.Ability); ok {
				item["name"] = a.Name
			}
			for _, e := range entries {
				if e.Ability == s.Ability {
					item["xp"] = e.Xp
					item["masteryTier"] = e.Tier
				}
			}
			slottedList = append(slottedList, item)
		}

		syllabus := make([]any, 0, len(Registry))
		for _, a := range Registry {
			if a.Family != FamilyALL && a.Family != family {
				continue
			}
			tier := MasteryTierForAbility(entries, a.ID)
			reason := reasonFor(a, family, facilityTier, tier)
			var reasonOut any
			if reason != "" {
				reasonOut = reason
			}
			syllabus = append(syllabus, map[string]any{
				"abilityId":    a.ID,
				"name":         a.Name,
				"family":       string(a.Family),
				"facilityTier": a.FacilityTier,
				"masteryTier":  a.MasteryTier,
				"trigger":      string(a.Trigger),
				"mastery":      tier,
				"eligible":     reason == "",
				"reason":       reasonOut,
			})
		}

		playerList = append(playerList, map[string]any{
			"playerId":    pid,
			"name":        playerName(p),
			"position":    db.StringField(p, "Position"),
			"role":        db.StringField(p, "Role"),
			"family":      string(family),
			"masteryTier": playerTier,
			"slots":       slots,
			"usedSlots":   len(slotted[pid]),
			"slotted":     slottedList,
			"syllabus":    syllabus,
		})
	}

	return map[string]any{
		"clubId":        db.StringField(club, "_id"),
		"name":          db.StringField(club, "Name"),
		"clubhouseTier": intOf(club["ClubhouseTier"]),
		"facilityTier":  facilityTier,
		"registry":      registryPayload(),
		"schools":       schoolLevels(levels),
		"players":       playerList,
	}, true, nil
}

// ---------------------------------------------------------------------------
// Internal helpers.
// ---------------------------------------------------------------------------

const (
	facilityKeyAcademy   = "academy"
	facilityKeyElite     = "elite_academy"
	facilityKeySquadCamp = "squad_camp"
	facilityKeyCoaching  = "coaching_dept"
	facilityKeyVideo     = "video_analysis"
)

func assertPlayerInClub(ctx context.Context, q db.Querier, clubID, playerID string) error {
	row, ok, err := one(ctx, q, `SELECT "ClubId" FROM "Players" WHERE "_id" = $1`, playerID)
	if err != nil {
		return err
	}
	if !ok || db.StringField(row, "ClubId") != clubID {
		return ErrPlayerNotFound
	}
	return nil
}

func masteryQuery(ctx context.Context, q db.Querier, playerID string) ([]map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT "Ability","Xp" FROM "PlayerMastery" WHERE "PlayerId" = $1 ORDER BY "Ability"`, playerID)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

func slottedQuery(ctx context.Context, q db.Querier, playerID string) ([]SlottedAbility, error) {
	rows, err := q.Query(ctx, `SELECT "Ability","Slot" FROM "PlayerAbilities" WHERE "PlayerId" = $1 ORDER BY "Slot"`, playerID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make([]SlottedAbility, 0, len(list))
	for _, m := range list {
		out = append(out, SlottedAbility{Ability: db.StringField(m, "Ability"), Slot: intOf(m["Slot"])})
	}
	return out, nil
}

func firstFreeSlot(slotted []SlottedAbility, capacity int) int {
	used := make(map[int]bool, len(slotted))
	for _, s := range slotted {
		used[s.Slot] = true
	}
	for i := 0; i < capacity; i++ {
		if !used[i] {
			return i
		}
	}
	return len(slotted)
}

func clubMastery(ctx context.Context, q db.Querier, clubID string) (map[string][]MasteryEntry, error) {
	rows, err := q.Query(ctx, `SELECT m."PlayerId", m."Ability", m."Xp"
		FROM "PlayerMastery" m JOIN "Players" p ON p."_id" = m."PlayerId" WHERE p."ClubId" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := map[string][]MasteryEntry{}
	for _, m := range list {
		pid := db.StringField(m, "PlayerId")
		xp := intOf(m["Xp"])
		out[pid] = append(out[pid], MasteryEntry{Ability: db.StringField(m, "Ability"), Xp: xp, Tier: MasteryTierForXp(xp)})
	}
	return out, nil
}

func clubSlotted(ctx context.Context, q db.Querier, clubID string) (map[string][]SlottedAbility, error) {
	rows, err := q.Query(ctx, `SELECT a."PlayerId", a."Ability", a."Slot"
		FROM "PlayerAbilities" a JOIN "Players" p ON p."_id" = a."PlayerId" WHERE p."ClubId" = $1 ORDER BY a."Slot"`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := map[string][]SlottedAbility{}
	for _, m := range list {
		pid := db.StringField(m, "PlayerId")
		out[pid] = append(out[pid], SlottedAbility{Ability: db.StringField(m, "Ability"), Slot: intOf(m["Slot"])})
	}
	return out, nil
}

func registryPayload() []any {
	out := make([]any, 0, len(Registry))
	for _, a := range Registry {
		out = append(out, map[string]any{
			"id":           a.ID,
			"name":         a.Name,
			"family":       string(a.Family),
			"facilityTier": a.FacilityTier,
			"masteryTier":  a.MasteryTier,
			"trigger":      string(a.Trigger),
			"effect":       string(a.Effect),
		})
	}
	return out
}

// PlayerLoadout returns a single player's ability/trait screen, used as the
// response to a successful slot/equip so the client sees the new state without
// a second request.
func (r *Repository) PlayerLoadout(ctx context.Context, playerID string) (map[string]any, error) {
	rows, err := masteryQuery(ctx, r.q, playerID)
	if err != nil {
		return nil, err
	}
	entries := masteryEntries(rows)
	slotted, err := r.SlottedAbilities(ctx, playerID)
	if err != nil {
		return nil, err
	}
	traits, err := r.EquippedTraits(ctx, playerID)
	if err != nil {
		return nil, err
	}
	playerTier := PlayerMasteryTier(entries)

	slottedPayload := make([]any, 0, len(slotted))
	for _, s := range slotted {
		item := map[string]any{"abilityId": s.Ability, "slot": s.Slot, "xp": 0, "masteryTier": 1}
		if a, ok := AbilityByID(s.Ability); ok {
			item["name"] = a.Name
		}
		for _, e := range entries {
			if e.Ability == s.Ability {
				item["xp"] = e.Xp
				item["masteryTier"] = e.Tier
			}
		}
		slottedPayload = append(slottedPayload, item)
	}
	masteryPayload := make([]any, 0, len(entries))
	for _, e := range entries {
		masteryPayload = append(masteryPayload, map[string]any{"abilityId": e.Ability, "xp": e.Xp, "tier": e.Tier})
	}
	traitPayload := make([]any, 0, len(traits))
	for _, t := range traits {
		traitPayload = append(traitPayload, map[string]any{"traitId": t.Trait, "slot": t.Slot, "rarity": string(t.Rarity)})
	}

	return map[string]any{
		"playerId":    playerID,
		"masteryTier": playerTier,
		"slots":       SlotCount(playerTier),
		"usedSlots":   len(slotted),
		"slotted":     slottedPayload,
		"mastery":     masteryPayload,
		"traits":      traitPayload,
	}, nil
}

// BuildOrderInventory returns a club's War Room stock plus the catalogue.
func (r *Repository) BuildOrderInventory(ctx context.Context, clubID string) (map[string]any, bool, error) {
	club, ok, err := one(ctx, r.q, `SELECT "_id","Name","Fans" FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil || !ok {
		return nil, ok, err
	}
	stock, err := r.OrderInventory(ctx, clubID)
	if err != nil {
		return nil, false, err
	}
	byID := make(map[string]int, len(stock))
	for _, e := range stock {
		byID[e.Order] = e.Count
	}
	list := make([]any, 0, len(Orders))
	for _, o := range Orders {
		item := map[string]any{
			"id":          o.ID,
			"name":        o.Name,
			"description": o.Description,
			"cost":        o.Cost,
			"trigger":     string(o.Trigger),
			"count":       byID[o.ID],
			"max":         MaxOrderCount,
		}
		if o.Region != nil {
			item["region"] = map[string]any{"x0": o.Region.X0, "x1": o.Region.X1, "y0": o.Region.Y0, "y1": o.Region.Y1}
		}
		list = append(list, item)
	}
	return map[string]any{
		"clubId": db.StringField(club, "_id"),
		"name":   db.StringField(club, "Name"),
		"fans":   intOf(club["Fans"]),
		"orders": list,
	}, true, nil
}
func schoolLevels(levels map[string]int) map[string]any {
	return map[string]any{
		"academy":       levels[facilityKeyAcademy],
		"eliteAcademy":  levels[facilityKeyElite],
		"squadCamp":     levels[facilityKeySquadCamp],
		"coaching":      levels[facilityKeyCoaching],
		"videoAnalysis": levels[facilityKeyVideo],
	}
}

func playerName(p map[string]any) string {
	first := db.StringField(p, "FirstName")
	last := db.StringField(p, "LastName")
	name := first + " " + last
	return trimSpace(name)
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && s[start] == ' ' {
		start++
	}
	for end > start && s[end-1] == ' ' {
		end--
	}
	return s[start:end]
}

// debitAlloys subtracts an alloy cost with a single guarded UPDATE, so a racing
// upgrade cannot overdraw.
func debitAlloys(ctx context.Context, q db.Querier, clubID string, cost Alloys) error {
	tag, err := q.Exec(ctx, `UPDATE "Clubs"
		SET "TraitAlloys" = jsonb_build_object(
			'shiny',  coalesce(("TraitAlloys"->>'shiny')::int, 0)  - $2,
			'glowy',  coalesce(("TraitAlloys"->>'glowy')::int, 0)  - $3,
			'starry', coalesce(("TraitAlloys"->>'starry')::int, 0) - $4),
		    "updatedAt" = now()
		WHERE "_id" = $1
		  AND coalesce(("TraitAlloys"->>'shiny')::int, 0)  >= $2
		  AND coalesce(("TraitAlloys"->>'glowy')::int, 0)  >= $3
		  AND coalesce(("TraitAlloys"->>'starry')::int, 0) >= $4`,
		clubID, cost.Shiny, cost.Glowy, cost.Starry)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInsufficientAlloys
	}
	return nil
}

func ledger(ctx context.Context, q db.Querier, clubID, typ string, amount float64, note string) error {
	_, err := q.Exec(ctx, `INSERT INTO "TransferLedger" ("Type","BuyerClubId","Amount","Note","updatedAt")
		VALUES ($1,$2,$3,$4,now())`, typ, clubID, amount, note)
	return err
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
