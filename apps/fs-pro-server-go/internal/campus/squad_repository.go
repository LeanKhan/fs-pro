package campus

import (
	"context"

	"fs-pro-server/internal/abilities"
	"fs-pro-server/internal/db"
)

// SquadStatus is a club's Squad Camp ("housing") state: the members, the used
// and cap slots, and a refusal when the squad is over budget.
type SquadStatus struct {
	ClubID   string
	Used     int
	Capacity int
	Members  []SquadMember
	Refusal  *SquadRefusal
}

// SquadState reads a club's signed, non-retired players, derives each archetype
// from Position/Role, and reports the housing use and cap from the Squad Camp
// level and Clubhouse tier. The PLAY gate can call this after
// internal/play.GateProblem passes.
//
// There is no `Players.StarTier` column yet, so every member is charged at Star
// tier 0; the pure model already accepts a tier for when the column lands.
func (r *Repository) SquadState(ctx context.Context, clubID string) (SquadStatus, bool, error) {
	club, ok, err := clubRow(ctx, r.q, clubID, false)
	if err != nil || !ok {
		return SquadStatus{}, ok, err
	}
	rows, err := r.q.Query(ctx, `SELECT "Position","Role" FROM "Players"
		WHERE "ClubId" = $1 AND "isSigned" = true AND "isRetired" = false
		ORDER BY "createdAt", "_id"`, clubID)
	if err != nil {
		return SquadStatus{}, false, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return SquadStatus{}, false, err
	}
	members := make([]SquadMember, 0, len(list))
	for _, p := range list {
		a := abilities.ArchetypeForPlayer(db.StringField(p, "Position"), db.StringField(p, "Role"))
		members = append(members, SquadMember{Archetype: a.ID})
	}
	assets, err := assetRows(ctx, r.q, clubID)
	if err != nil {
		return SquadStatus{}, false, err
	}
	capacity := SquadCapacity(levelOf(assets, FacilitySquadCamp), intOf(club["ClubhouseTier"]))
	used, _ := SquadUsage(members)
	return SquadStatus{
		ClubID:   clubID,
		Used:     used,
		Capacity: capacity,
		Members:  members,
		Refusal:  SquadProblem(members, capacity),
	}, true, nil
}
