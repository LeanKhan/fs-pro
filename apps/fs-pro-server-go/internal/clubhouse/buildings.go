package clubhouse

import (
	"context"
	"fmt"
	"strings"

	"fs-pro-server/internal/db"
)

// The seven campus buildings (launch consolidation). Each building upgrades
// exactly one *primary* ClubAssets row; the older assets it absorbed are
// *linked* and always carry the primary's level, so every existing gate that
// reads them (collectors, vault caps, ability research, the youth academy,
// archetype schools) keeps working without knowing about the merge.
//
// Key is the campus placement key (the building on the grid).
type Building struct {
	Key     string
	Name    string
	Primary string
	Linked  []string
}

// Buildings is the canonical, ordered list.
var Buildings = []Building{
	{Key: "office", Name: "Clubhouse", Primary: "clubhouse"},
	{Key: "stadium_grounds", Name: "Stadium", Primary: "turnstiles", Linked: []string{"stadium_grounds", "stands"}},
	{Key: "club_shop", Name: "Club Shop", Primary: "club_shop"},
	{Key: "cash_vault", Name: "Club Vault", Primary: "cash_vault", Linked: []string{"fan_vault"}},
	{Key: "training_ground", Name: "Training Ground", Primary: "training_ground", Linked: []string{"staff_house", "coaching_dept", "video_analysis"}},
	{Key: "youth_academy", Name: "Youth Academy", Primary: "youth_academy", Linked: []string{"scouting", "academy", "elite_academy", "squad_camp"}},
	{Key: "medical_centre", Name: "Medical Centre", Primary: "medical_centre"},
}

// BuildingFor returns the building that owns an asset (as primary or linked).
func BuildingFor(asset string) (Building, bool) {
	for _, b := range Buildings {
		if b.Primary == asset {
			return b, true
		}
		for _, l := range b.Linked {
			if l == asset {
				return b, true
			}
		}
	}
	return Building{}, false
}

// LinkedRefusal is the reason an asset cannot be upgraded on its own ("" when
// it can): a linked asset follows its building's primary.
func LinkedRefusal(asset string) string {
	b, ok := BuildingFor(asset)
	if !ok || b.Primary == asset {
		return ""
	}
	return fmt.Sprintf("%s is part of the %s now - upgrade the %s", prettyAsset(asset), b.Name, b.Name)
}

func prettyAsset(asset string) string {
	s := strings.ReplaceAll(asset, "_", " ")
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// linkedPairsSQL is the (primary, linked) VALUES list for SyncLinked.
func linkedPairsSQL() string {
	var parts []string
	for _, b := range Buildings {
		for _, l := range b.Linked {
			parts = append(parts, fmt.Sprintf("('%s','%s')", b.Primary, l))
		}
	}
	return strings.Join(parts, ",")
}

// SyncLinked sets every linked asset's level to its primary's, inserting
// missing rows. clubID "" syncs every club. Idempotent; called after any
// promotion and at founding.
func SyncLinked(ctx context.Context, q db.Querier, clubID string) error {
	pairs := linkedPairsSQL()
	if pairs == "" {
		return nil
	}
	_, err := q.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId", "AssetType", "Level", "updatedAt")
		SELECT p."ClubId", l.linked, p."Level", now()
		FROM "ClubAssets" p
		JOIN (VALUES `+pairs+`) AS l(prim, linked) ON l.prim = p."AssetType"
		WHERE ($1 = '' OR p."ClubId"::text = $1)
		ON CONFLICT ("ClubId", "AssetType") DO UPDATE
		SET "Level" = EXCLUDED."Level", "UpgradingTo" = NULL, "StartAt" = NULL, "CompleteAt" = NULL, "updatedAt" = now()
		WHERE "ClubAssets"."Level" IS DISTINCT FROM EXCLUDED."Level"`, clubID)
	return err
}
