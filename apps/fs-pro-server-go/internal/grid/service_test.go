package grid

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func newTestService() *Service { return NewService(NewMemoryRepository()) }

func TestSaveLayoutPersistsValidGrid(t *testing.T) {
	svc := newTestService()
	ctx := context.Background()
	if err := svc.SaveLayout(ctx, "club-1", Home, validGrid(), 1); err != nil {
		t.Fatalf("SaveLayout: %v", err)
	}

	slots, xi, err := svc.MatchPayload(ctx, "club-1", Home)
	if err != nil {
		t.Fatalf("MatchPayload: %v", err)
	}
	if len(slots) != Starters {
		t.Errorf("slots = %d, want %d", len(slots), Starters)
	}
	if len(xi) != Starters {
		t.Errorf("startingXI = %d, want %d", len(xi), Starters)
	}
	if xi[0] != "gk" || xi[10] != "a3" {
		t.Errorf("startingXI = %v, want gk..a3", xi)
	}
	if slots[0].X != 0.5/9 || slots[0].Y != 3.5/7 {
		t.Errorf("keeper slot = %+v, want x=0.5/9 y=3.5/7", slots[0])
	}
}

func TestSaveLayoutRejectsInvalidGridWithExactReason(t *testing.T) {
	svc := newTestService()
	ctx := context.Background()
	g := validGrid()
	g.Slots = g.Slots[:10] // one short
	want := Validate(g, 1)

	err := svc.SaveLayout(ctx, "club-1", Home, g, 1)
	var invalid InvalidLayoutError
	if !errors.As(err, &invalid) {
		t.Fatalf("err = %v, want InvalidLayoutError", err)
	}
	if invalid.Reason != want {
		t.Errorf("reason = %q, want the exact Validate reason %q", invalid.Reason, want)
	}
	if err.Error() != want {
		t.Errorf("error text = %q, want %q", err.Error(), want)
	}

	// A refused save must not have persisted anything.
	if _, _, err := svc.MatchPayload(ctx, "club-1", Home); !errors.Is(err, ErrNoLayout) {
		t.Errorf("invalid save persisted a layout (err = %v)", err)
	}
}

func TestSaveLayoutRejectsUnknownSlot(t *testing.T) {
	svc := newTestService()
	err := svc.SaveLayout(context.Background(), "club-1", LayoutSlot("away"), validGrid(), 5)
	var invalid InvalidLayoutError
	if !errors.As(err, &invalid) {
		t.Fatalf("err = %v, want InvalidLayoutError", err)
	}
	if !strings.Contains(invalid.Reason, "away") {
		t.Errorf("reason = %q, want it to name the slot", invalid.Reason)
	}
}

func TestSaveLayoutTierGate(t *testing.T) {
	svc := newTestService()
	ctx := context.Background()
	g := validGrid()
	g.Slots[8].Col = 5 // X5 is locked until Clubhouse tier 2
	if err := svc.SaveLayout(ctx, "club-1", Home, g, 1); err == nil {
		t.Fatal("a locked column must be refused")
	}
	if err := svc.SaveLayout(ctx, "club-1", Home, g, 2); err != nil {
		t.Fatalf("X5 should save at tier 2: %v", err)
	}
}

func TestMatchPayloadEmptySlotIsErrNoLayout(t *testing.T) {
	svc := newTestService()
	if _, _, err := svc.MatchPayload(context.Background(), "club-1", Home); !errors.Is(err, ErrNoLayout) {
		t.Fatalf("err = %v, want ErrNoLayout", err)
	}
}

func TestSaveLayoutKeepsOtherSlots(t *testing.T) {
	svc := newTestService()
	ctx := context.Background()
	if err := svc.SaveLayout(ctx, "club-1", Home, validGrid(), 1); err != nil {
		t.Fatalf("SaveLayout Home: %v", err)
	}
	if err := svc.SaveLayout(ctx, "club-1", Match, validGrid(), 1); err != nil {
		t.Fatalf("SaveLayout Match: %v", err)
	}
	if _, _, err := svc.MatchPayload(ctx, "club-1", Home); err != nil {
		t.Errorf("Home was clobbered: %v", err)
	}
	if _, _, err := svc.MatchPayload(ctx, "club-1", Match); err != nil {
		t.Errorf("Match missing: %v", err)
	}
	if _, _, err := svc.MatchPayload(ctx, "club-1", Derby); !errors.Is(err, ErrNoLayout) {
		t.Errorf("Derby err = %v, want ErrNoLayout", err)
	}
}

// TestMemoryRepositoryIsolatesCallers proves the store clones grids: mutating a
// grid after saving, or a grid returned by GetLayouts, must not affect stored
// state.
func TestMemoryRepositoryIsolatesCallers(t *testing.T) {
	ctx := context.Background()
	repo := NewMemoryRepository()
	g := validGrid()
	if err := repo.SetLayout(ctx, "club-1", Home, g); err != nil {
		t.Fatalf("SetLayout: %v", err)
	}
	g.Slots[0].Col = 8 // mutate the caller's copy

	got, err := repo.GetLayouts(ctx, "club-1")
	if err != nil {
		t.Fatalf("GetLayouts: %v", err)
	}
	saved, _ := got.Grid(Home)
	if saved.Slots[0].Col == 8 {
		t.Fatal("stored grid was mutated through the caller's slice")
	}
	saved.Slots[0].Col = 8 // mutate the returned copy
	again, _ := repo.GetLayouts(ctx, "club-1")
	if s2, _ := again.Grid(Home); s2.Slots[0].Col == 8 {
		t.Fatal("GetLayouts returned a live reference to stored state")
	}
}
