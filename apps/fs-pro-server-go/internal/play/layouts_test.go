package play

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"fs-pro-server/internal/grid"
)

// stubRepo is a grid.Repository with a fixed layout document (or an error), so
// withStoredLayout can be tested without a database.
type stubRepo struct {
	layouts grid.Layouts
	err     error
}

func (s stubRepo) GetLayouts(context.Context, string) (grid.Layouts, error) {
	return s.layouts, s.err
}
func (s stubRepo) SetLayout(context.Context, string, grid.LayoutSlot, grid.Grid) error { return nil }
func (s stubRepo) Publish(context.Context, string, string, grid.LayoutSlot, grid.Grid) error {
	return nil
}
func (s stubRepo) Import(context.Context, string) (grid.Published, error) {
	return grid.Published{}, nil
}

func homeTactic() map[string]any {
	return map[string]any{"formationName": "433", "styleName": "Balanced"}
}

func TestWithStoredLayoutPrefersSlotThenFallsBack(t *testing.T) {
	matchGrid := scoutHomeGrid()
	homeGrid := grid.Grid{Slots: append([]grid.Slot{}, scoutHomeGrid().Slots...)}
	homeGrid.Slots[8] = grid.Slot{Col: 5, Row: 1, PlayerID: "hx", Position: grid.ATT}

	t.Run("prefers the requested slot", func(t *testing.T) {
		got := withStoredLayout(context.Background(), stubRepo{layouts: grid.Layouts{
			grid.Match: matchGrid, grid.Home: homeGrid,
		}}, "c1", grid.Match, homeTactic())
		if !reflect.DeepEqual(got["slots"], grid.SimSlots(matchGrid)) {
			t.Errorf("slots did not come from the Match grid: %#v", got["slots"])
		}
	})

	t.Run("falls back when the slot is empty", func(t *testing.T) {
		got := withStoredLayout(context.Background(), stubRepo{layouts: grid.Layouts{
			grid.Home: homeGrid,
		}}, "c1", grid.Match, homeTactic())
		if !reflect.DeepEqual(got["slots"], grid.SimSlots(homeGrid)) {
			t.Errorf("slots did not fall back to the Home grid: %#v", got["slots"])
		}
	})
}

func TestWithStoredLayoutKeepsFormationWhenAbsent(t *testing.T) {
	base := homeTactic()
	got := withStoredLayout(context.Background(), stubRepo{layouts: grid.Layouts{}}, "c1", grid.Match, base)
	if _, ok := got["slots"]; ok {
		t.Errorf("no stored layout must leave the formation untouched: %#v", got)
	}
	if got["formationName"] != "433" {
		t.Errorf("formation was lost: %#v", got)
	}
}

func TestWithStoredLayoutIsSafeOnErrorAndNil(t *testing.T) {
	base := homeTactic()
	// A repository error (e.g. Clubs.Layouts not migrated yet) must not break
	// the match: the formation stands.
	got := withStoredLayout(context.Background(), stubRepo{err: errors.New("no column")}, "c1", grid.Match, base)
	if _, ok := got["slots"]; ok {
		t.Errorf("a layout read error must fall back to the formation: %#v", got)
	}
	got = withStoredLayout(context.Background(), nil, "c1", grid.Match, base)
	if _, ok := got["slots"]; ok {
		t.Errorf("a nil repository must fall back to the formation: %#v", got)
	}
}

func TestWithStoredLayoutNeverMutatesTheInput(t *testing.T) {
	base := homeTactic()
	_ = withStoredLayout(context.Background(), stubRepo{layouts: grid.Layouts{grid.Home: scoutHomeGrid()}}, "c1", grid.Match, base)
	if _, ok := base["slots"]; ok {
		t.Errorf("withStoredLayout mutated its input tactic: %#v", base)
	}
}
