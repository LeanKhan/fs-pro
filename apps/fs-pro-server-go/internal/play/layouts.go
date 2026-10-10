package play

import (
	"context"

	"fs-pro-server/internal/grid"
)

// The Pitch Grid is compiled into the sim request as freeform formation slots
// (docs/coc-mapping/03 §1.7-1.9, 05 §5). A club's `match` grid is its default
// attacking shape; the `home` grid is the snapshot that defends it while
// offline. When no layout is stored the existing formation is left untouched.

// layoutRepo returns the read-only layout store used when building a
// sim-service request. It is built from the match repository's querier so the
// match path stays a single dependency.
func (r *Repository) layoutRepo() grid.Repository {
	return grid.NewPgRepository(r.q)
}

// withStoredLayout returns a copy of tactic carrying the club's stored grid as
// `slots`, preferring `prefer` and otherwise trying the remaining slots. A club
// with no readable layout (none saved, or Clubs.Layouts not yet migrated) keeps
// its formation, so the feature degrades safely.
func withStoredLayout(ctx context.Context, repo grid.Repository, clubID string, prefer grid.LayoutSlot, tactic map[string]any) map[string]any {
	if repo == nil || clubID == "" {
		return tactic
	}
	layouts, err := repo.GetLayouts(ctx, clubID)
	if err != nil {
		return tactic
	}
	g, ok := layouts.Grid(prefer)
	if !ok || len(g.Slots) != grid.Starters {
		ok = false
		for _, s := range []grid.LayoutSlot{grid.Match, grid.Home, grid.Derby} {
			if cand, present := layouts.Grid(s); present && len(cand.Slots) == grid.Starters {
				g, ok = cand, true
				break
			}
		}
	}
	if !ok {
		return tactic
	}
	out := make(map[string]any, len(tactic)+1)
	for k, v := range tactic {
		out[k] = v
	}
	out["slots"] = grid.SimSlots(g)
	return out
}
