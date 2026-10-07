package tiles

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"fs-pro-world-service/internal/db"
)

func TestKeyValidAndString(t *testing.T) {
	tests := []struct {
		key   Key
		valid bool
		str   string
	}{
		{Key{0, 0, 0}, true, "0/0/0"},
		{Key{5, 12, 7}, true, "5/12/7"},
		{Key{6, 0, 0}, false, "6/0/0"},
		{Key{-1, 0, 0}, false, "-1/0/0"},
		{Key{3, -1, 0}, false, "3/-1/0"},
	}
	for _, tt := range tests {
		if got := tt.key.Valid(); got != tt.valid {
			t.Errorf("%v.Valid() = %v, want %v", tt.key, got, tt.valid)
		}
		if got := tt.key.String(); got != tt.str {
			t.Errorf("%v.String() = %q, want %q", tt.key, got, tt.str)
		}
	}
}

func TestCellAtQuadtreeHalves(t *testing.T) {
	// z0: the whole 256-unit base cell is (0,0).
	if x, y := CellAt(0, 0, 0); x != 0 || y != 0 {
		t.Fatalf("CellAt(0,0,0) = %d,%d want 0,0", x, y)
	}
	if x, y := CellAt(255.9, 255.9, 0); x != 0 || y != 0 {
		t.Fatalf("CellAt(255.9,255.9,0) = %d,%d want 0,0", x, y)
	}
	// z1 splits each z0 cell into four 128-unit cells.
	if x, y := CellAt(130, 5, 1); x != 1 || y != 0 {
		t.Fatalf("CellAt(130,5,1) = %d,%d want 1,0", x, y)
	}
	// z2: 64-unit cells.
	if x, y := CellAt(130, 130, 2); x != 2 || y != 2 {
		t.Fatalf("CellAt(130,130,2) = %d,%d want 2,2", x, y)
	}
	// The cell of a place is a prefix of its cell at every lower zoom.
	x, y := CellAt(1000, 700, 4)
	for z := 3; z >= 0; z-- {
		px, py := CellAt(1000, 700, z)
		if x>>(4-z) != px || y>>(4-z) != py {
			t.Fatalf("z%d cell (%d,%d) is not the parent of z4 (%d,%d)", z, px, py, x, y)
		}
	}
}

func TestLevelForZoom(t *testing.T) {
	want := map[int]string{0: "country", 1: "country", 2: "region", 3: "city", 4: "district", 5: "district"}
	for z, lvl := range want {
		if got := LevelForZoom(z); got != lvl {
			t.Errorf("LevelForZoom(%d) = %q, want %q", z, got, lvl)
		}
	}
}

func TestClubCapForZoom(t *testing.T) {
	want := map[int]int{0: 3, 1: 5, 2: 5, 3: 8, 4: 10, 5: 0}
	for z, cap := range want {
		if got := ClubCapForZoom(z); got != cap {
			t.Errorf("ClubCapForZoom(%d) = %d, want %d", z, got, cap)
		}
	}
}

func TestCapPerPlace(t *testing.T) {
	rows := []clubRow{
		{marker: ClubMarker{ID: "a1", Prominence: 9}, district: "a"},
		{marker: ClubMarker{ID: "a2", Prominence: 8}, district: "a"},
		{marker: ClubMarker{ID: "a3", Prominence: 7}, district: "a"},
		{marker: ClubMarker{ID: "b1", Prominence: 6}, district: "b"},
		{marker: ClubMarker{ID: "a4", Prominence: 5}, district: "a"},
	}
	got := capPerPlace(rows, 2)
	if len(got) != 3 {
		t.Fatalf("capPerPlace(cap=2) returned %d clubs, want 3 (%v)", len(got), got)
	}
	for _, m := range got {
		if m.ID == "a3" || m.ID == "a4" {
			t.Fatalf("capPerPlace kept over-cap club %s", m.ID)
		}
	}
	if all := capPerPlace(rows, 0); len(all) != len(rows) {
		t.Fatalf("capPerPlace(cap=0) dropped clubs: %d != %d", len(all), len(rows))
	}
}

func TestBuildRejectsBadInput(t *testing.T) {
	s := New(nil)
	if _, err := s.Build(context.Background(), Key{Z: 9}); !errors.Is(err, ErrInvalidKey) {
		t.Fatalf("Build(bad key) error = %v, want ErrInvalidKey", err)
	}
	if _, err := s.Build(context.Background(), Key{Z: 1}); err == nil {
		t.Fatal("Build(nil querier) error = nil, want error")
	}
}

// Integration: builds a real tile against a scratch DB.
//
//	WORLD_TEST_DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_b2c \
//	  go test ./internal/tiles -run TestBuildIntegration -v
func TestBuildIntegration(t *testing.T) {
	url := os.Getenv("WORLD_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set WORLD_TEST_DATABASE_URL to a scratch DB to run this integration test")
	}
	pool, err := db.New(context.Background(), url, 10*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()

	s := New(pool)
	// z0 (0,0) always exists and must never exceed the payload budget.
	tile, err := s.Build(context.Background(), Key{Z: 0, X: 0, Y: 0})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if len(tile.Places) > TileMaxPlaces || len(tile.Clubs) > TileMaxClubs {
		t.Fatalf("tile over budget: %d places, %d clubs", len(tile.Places), len(tile.Clubs))
	}
}
