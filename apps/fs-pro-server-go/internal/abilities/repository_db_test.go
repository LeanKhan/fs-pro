package abilities

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"sync/atomic"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

var abilitySeq int64

func newAbilityClub(t *testing.T, ctx context.Context, q db.Querier, overrides map[string]any) string {
	t.Helper()
	code := fmt.Sprintf("AB%d", atomic.AddInt64(&abilitySeq, 1))
	data := map[string]any{"Name": "Abilities Test " + code, "ClubCode": code, "updatedAt": time.Now()}
	for k, v := range overrides {
		data[k] = v
	}
	row, err := db.InsertRow(ctx, q, "Clubs", data)
	if err != nil {
		t.Fatalf("insert club: %v", err)
	}
	return db.StringField(row, "_id")
}

func newAbilityPlayer(t *testing.T, ctx context.Context, q db.Querier, clubID, position, role string) string {
	t.Helper()
	row, err := db.InsertRow(ctx, q, "Players", map[string]any{
		"FirstName": "Test", "LastName": "Player", "ClubId": clubID,
		"Position": position, "Role": role, "isSigned": true, "updatedAt": time.Now(),
	})
	if err != nil {
		t.Fatalf("insert player: %v", err)
	}
	return db.StringField(row, "_id")
}

func setAsset(t *testing.T, ctx context.Context, q db.Querier, clubID, asset string, level int) {
	t.Helper()
	if _, err := q.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","updatedAt")
		VALUES ($1,$2,$3,now()) ON CONFLICT ("ClubId","AssetType") DO UPDATE SET "Level"=$3, "updatedAt"=now()`,
		clubID, asset, level); err != nil {
		t.Fatalf("set asset %s: %v", asset, err)
	}
}

func seedMastery(t *testing.T, ctx context.Context, q db.Querier, playerID, ability string, xp int) {
	t.Helper()
	if _, err := q.Exec(ctx, `INSERT INTO "PlayerMastery" ("PlayerId","Ability","Xp","updatedAt")
		VALUES ($1,$2,$3,now()) ON CONFLICT ("PlayerId","Ability") DO UPDATE SET "Xp"=$3, "updatedAt"=now()`,
		playerID, ability, xp); err != nil {
		t.Fatalf("seed mastery %s: %v", ability, err)
	}
}

func countType(t *testing.T, ctx context.Context, q db.Querier, clubID, typ string) int {
	t.Helper()
	row, ok, err := one(ctx, q, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId"=$1 AND "Type"=$2`, clubID, typ)
	if err != nil || !ok {
		t.Fatalf("ledger count: ok=%v err=%v", ok, err)
	}
	return intOf(row["n"])
}

func TestAbilitiesRepositoryRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.New(ctx, url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)

		// ---------------------------------------------------------------
		// Slotting gates: family, facility tier, mastery tier, slot cap.
		// ---------------------------------------------------------------
		club := newAbilityClub(t, ctx, tx, map[string]any{"Fans": 100000, "ClubhouseTier": 3})
		mid := newAbilityPlayer(t, ctx, tx, club, "MID", "CM")

		// A fresh player (facility 0) can slot the ALL baseline (facility 0,
		// mastery 1).
		if err := repo.SlotAbility(ctx, club, mid, "standard_ground_pass"); err != nil {
			return fmt.Errorf("slot baseline: %w", err)
		}
		// Re-slotting the same ability is an idempotent no-op.
		if err := repo.SlotAbility(ctx, club, mid, "standard_ground_pass"); err != nil {
			return fmt.Errorf("idempotent re-slot: %w", err)
		}
		// Shirt typo id is refused.
		if err := repo.SlotAbility(ctx, club, mid, "nope"); !errors.Is(err, ErrUnknownAbility) {
			return fmt.Errorf("unknown ability err = %v, want ErrUnknownAbility", err)
		}
		// Whipped Cross needs Coaching tier 1; the club has none.
		if err := repo.SlotAbility(ctx, club, mid, "whipped_cross"); !errors.Is(err, ErrFacilityGate) {
			return fmt.Errorf("facility gate err = %v, want ErrFacilityGate", err)
		}
		// A DEF-only ability is not in the MID player's family (clear_under is
		// DEF). Use tactical_foul which is DEF.
		if err := repo.SlotAbility(ctx, club, mid, "tactical_foul"); !errors.Is(err, ErrFamilyMismatch) {
			return fmt.Errorf("family err = %v, want ErrFamilyMismatch", err)
		}
		// Raise the Coaching tier; now Whipped Cross fails on mastery only.
		setAsset(t, ctx, tx, club, "coaching_dept", 2)
		if err := repo.SlotAbility(ctx, club, mid, "whipped_cross"); !errors.Is(err, ErrMasteryGate) {
			return fmt.Errorf("mastery gate err = %v, want ErrMasteryGate", err)
		}
		// Earn mastery tier 2 in Whipped Cross, then it slots.
		if _, err := repo.AddMasteryXp(ctx, mid, "whipped_cross", 500); err != nil {
			return fmt.Errorf("add mastery: %w", err)
		}
		if err := repo.SlotAbility(ctx, club, mid, "whipped_cross"); err != nil {
			return fmt.Errorf("slot after mastery: %w", err)
		}
		// The pid must belong to the club in the path.
		other := newAbilityClub(t, ctx, tx, nil)
		if err := repo.SlotAbility(ctx, other, mid, "standard_ground_pass"); !errors.Is(err, ErrPlayerNotFound) {
			return fmt.Errorf("cross-club pid err = %v, want ErrPlayerNotFound", err)
		}

		// ---------------------------------------------------------------
		// Slot cap: a fully mastered DEF player gets 3 slots.
		// ---------------------------------------------------------------
		def := newAbilityPlayer(t, ctx, tx, club, "DEF", "CDM")
		setAsset(t, ctx, tx, club, "coaching_dept", 3)
		setAsset(t, ctx, tx, club, "video_analysis", 2) // facility tier 5
		for _, id := range []string{"clear_under_pressure", "tactical_foul", "slide_tackle_recovery", "offside_trap_step_up"} {
			seedMastery(t, ctx, tx, def, id, 7000)
		}
		for _, id := range []string{"clear_under_pressure", "tactical_foul", "slide_tackle_recovery"} {
			if err := repo.SlotAbility(ctx, club, def, id); err != nil {
				return fmt.Errorf("slot %s: %w", id, err)
			}
		}
		if err := repo.SlotAbility(ctx, club, def, "offside_trap_step_up"); !errors.Is(err, ErrSlotCap) {
			return fmt.Errorf("slot cap err = %v, want ErrSlotCap", err)
		}
		// Unslot frees a slot.
		if err := repo.UnslotAbility(ctx, club, def, "tactical_foul"); err != nil {
			return fmt.Errorf("unslot: %w", err)
		}
		if err := repo.SlotAbility(ctx, club, def, "offside_trap_step_up"); err != nil {
			return fmt.Errorf("slot after unslot: %w", err)
		}
		// Idempotent unslot of an absent ability is fine.
		if err := repo.UnslotAbility(ctx, club, def, "tactical_foul"); err != nil {
			return fmt.Errorf("idempotent unslot: %w", err)
		}

		// ---------------------------------------------------------------
		// Mastery xp accumulates and DrillXp shares the curve.
		// ---------------------------------------------------------------
		entry, err := repo.AddMasteryXp(ctx, mid, "whipped_cross", 1000)
		if err != nil {
			return err
		}
		if entry.Xp != 1500 || entry.Tier != 3 {
			return fmt.Errorf("mastery after add = %+v, want xp 1500 tier 3", entry)
		}
		if _, err := repo.DrillXp(ctx, mid, "whipped_cross", 3500); err != nil {
			return err
		}
		// Drills grant ability mastery only: the player-development row (Rating,
		// Attributes, TrainingFocus, Fitness, ...) must be byte-identical, so the
		// existing player-development distributions cannot regress.
		before, ok, err := one(ctx, tx, `SELECT * FROM "Players" WHERE "_id" = $1`, mid)
		if err != nil || !ok {
			return fmt.Errorf("snapshot player: ok=%v err=%v", ok, err)
		}
		if _, err := repo.DrillXp(ctx, mid, "whipped_cross", 250); err != nil {
			return fmt.Errorf("drill xp: %w", err)
		}
		after, ok, err := one(ctx, tx, `SELECT * FROM "Players" WHERE "_id" = $1`, mid)
		if err != nil || !ok {
			return fmt.Errorf("re-snapshot player: ok=%v err=%v", ok, err)
		}
		if !reflect.DeepEqual(before, after) {
			return fmt.Errorf("DrillXp touched the player-development row: %v -> %v", before, after)
		}
		if _, err := repo.AddMasteryXp(ctx, mid, "whipped_cross", 0); !errors.Is(err, ErrInvalidXp) {
			return fmt.Errorf("zero xp err = %v, want ErrInvalidXp", err)
		}

		// ---------------------------------------------------------------
		// Traits: 2 slots, rarity resets on swap, alloy upgrades.
		// ---------------------------------------------------------------
		if err := repo.EquipTrait(ctx, club, mid, "iron_wall", 0); err != nil {
			return fmt.Errorf("equip iron_wall: %w", err)
		}
		if err := repo.EquipTrait(ctx, club, mid, "iron_wall", 0); err != nil {
			return fmt.Errorf("idempotent equip: %w", err)
		}
		if err := repo.EquipTrait(ctx, club, mid, "aerial_threat", 1); err != nil {
			return fmt.Errorf("equip aerial_threat: %w", err)
		}
		if err := repo.EquipTrait(ctx, club, mid, "engine", 2); !errors.Is(err, ErrInvalidSlot) {
			return fmt.Errorf("third slot err = %v, want ErrInvalidSlot", err)
		}
		if err := repo.EquipTrait(ctx, club, mid, "nope", 0); !errors.Is(err, ErrUnknownTrait) {
			return fmt.Errorf("unknown trait err = %v, want ErrUnknownTrait", err)
		}
		// Swapping slot 0 resets its rarity.
		if err := repo.EquipTrait(ctx, club, mid, "free_role", 0); err != nil {
			return fmt.Errorf("swap slot 0: %w", err)
		}
		// Upgrade a trait not equipped by id.
		if _, err := repo.UpgradeTrait(ctx, club, mid, "iron_wall"); !errors.Is(err, ErrTraitNotEquipped) {
			return fmt.Errorf("upgrade unequipped err = %v, want ErrTraitNotEquipped", err)
		}
		// Insufficient alloys: no shiny yet.
		if _, err := repo.UpgradeTrait(ctx, club, mid, "aerial_threat"); !errors.Is(err, ErrInsufficientAlloys) {
			return fmt.Errorf("no alloys err = %v, want ErrInsufficientAlloys", err)
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "TraitAlloys" = '{"shiny":150,"glowy":0,"starry":0}'::jsonb WHERE "_id"=$1`, club); err != nil {
			return err
		}
		rarity, err := repo.UpgradeTrait(ctx, club, mid, "aerial_threat")
		if err != nil {
			return fmt.Errorf("upgrade to glowy: %w", err)
		}
		if rarity != RarityGlowy {
			return fmt.Errorf("rarity = %s, want glowy", rarity)
		}
		row, ok, err := one(ctx, tx, `SELECT "TraitAlloys" FROM "Clubs" WHERE "_id"=$1`, club)
		if err != nil || !ok {
			return fmt.Errorf("read alloys: ok=%v err=%v", ok, err)
		}
		if got := alloyInt(row["TraitAlloys"], "shiny"); got != 50 {
			return fmt.Errorf("shiny after upgrade = %d, want 50", got)
		}
		if countType(t, ctx, tx, club, "trait_alloy") != 1 {
			return fmt.Errorf("upgrade must write one trait_alloy ledger row")
		}
		// Glowy -> Starry needs 60 glowy: none.
		if _, err := repo.UpgradeTrait(ctx, club, mid, "aerial_threat"); !errors.Is(err, ErrInsufficientAlloys) {
			return fmt.Errorf("glowy shortfall err = %v", err)
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "TraitAlloys" = '{"shiny":0,"glowy":60,"starry":0}'::jsonb WHERE "_id"=$1`, club); err != nil {
			return err
		}
		if rarity, err = repo.UpgradeTrait(ctx, club, mid, "aerial_threat"); err != nil || rarity != RarityStarry {
			return fmt.Errorf("to starry = %s/%v", rarity, err)
		}
		if _, err := repo.UpgradeTrait(ctx, club, mid, "aerial_threat"); !errors.Is(err, ErrMaxRarity) {
			return fmt.Errorf("max rarity err = %v, want ErrMaxRarity", err)
		}

		// ---------------------------------------------------------------
		// War Room orders: cost, idempotency, guarded debit.
		// ---------------------------------------------------------------
		if _, err := repo.PrepareOrder(ctx, club, "nope", 1); !errors.Is(err, ErrUnknownOrder) {
			return fmt.Errorf("unknown order err = %v", err)
		}
		if _, err := repo.PrepareOrder(ctx, club, "press_trap", 99); !errors.Is(err, ErrInvalidCount) {
			return fmt.Errorf("bad count err = %v, want ErrInvalidCount", err)
		}
		entry2, err := repo.PrepareOrder(ctx, club, "press_trap", 2)
		if err != nil || entry2.Count != 2 {
			return fmt.Errorf("prepare press_trap = %+v/%v", entry2, err)
		}
		// press_trap costs 250 Fans each: 500 debited. Set Fans and verify.
		row, _, _ = one(ctx, tx, `SELECT "Fans" FROM "Clubs" WHERE "_id"=$1`, club)
		if intOf(row["Fans"]) != 99500 {
			return fmt.Errorf("fans after prepare = %d, want 99500", intOf(row["Fans"]))
		}
		if countType(t, ctx, tx, club, "order") != 1 {
			return fmt.Errorf("prepare must write one order ledger row")
		}
		// Same target again is a no-op: no extra debit, no extra ledger.
		if _, err := repo.PrepareOrder(ctx, club, "press_trap", 2); err != nil {
			return fmt.Errorf("idempotent prepare: %w", err)
		}
		if countType(t, ctx, tx, club, "order") != 1 {
			return fmt.Errorf("idempotent prepare wrote a ledger row")
		}
		if _, err := repo.PrepareOrder(ctx, club, "press_trap", 1); err != nil {
			return fmt.Errorf("reducing stock must be a no-op: %w", err)
		}
		// Insufficient Fans is guarded.
		poor := newAbilityClub(t, ctx, tx, map[string]any{"Fans": 100})
		if _, err := repo.PrepareOrder(ctx, poor, "overload_flank", 1); !errors.Is(err, ErrInsufficientFunds) {
			return fmt.Errorf("poor order err = %v, want ErrInsufficientFunds", err)
		}
		// Unknown club.
		if _, err := repo.PrepareOrder(ctx, "00000000-0000-0000-0000-000000000000", "press_trap", 1); !errors.Is(err, ErrClubNotFound) {
			return fmt.Errorf("missing club err = %v, want ErrClubNotFound", err)
		}

		// ---------------------------------------------------------------
		// Read models.
		// ---------------------------------------------------------------
		payload, ok, err := repo.BuildClubAbilities(ctx, club)
		if err != nil || !ok {
			return fmt.Errorf("BuildClubAbilities ok=%v err=%v", ok, err)
		}
		if intOf(payload["facilityTier"]) != 5 {
			return fmt.Errorf("facilityTier = %v, want 5", payload["facilityTier"])
		}
		players, _ := payload["players"].([]any)
		if len(players) < 2 {
			return fmt.Errorf("players = %d, want >= 2", len(players))
		}
		if _, ok, err := repo.BuildClubAbilities(ctx, "00000000-0000-0000-0000-000000000000"); err != nil || ok {
			return fmt.Errorf("missing club: ok=%v err=%v", ok, err)
		}
		loadout, err := repo.PlayerLoadout(ctx, mid)
		if err != nil {
			return err
		}
		if _, ok := loadout["slots"].(int); !ok {
			return fmt.Errorf("loadout missing slots: %+v", loadout)
		}
		if _, ok, err := repo.BuildOrderInventory(ctx, club); err != nil || !ok {
			return fmt.Errorf("order inventory ok=%v err=%v", ok, err)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back abilities: %v", err)
	}
}

// alloyInt reads an int field out of a jsonb alloy map (decoded as map[string]any).
func alloyInt(v any, key string) int {
	m, _ := v.(map[string]any)
	return intOf(m[key])
}
