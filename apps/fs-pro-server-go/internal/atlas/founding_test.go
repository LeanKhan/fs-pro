package atlas

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func one(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func TestMissingNames(t *testing.T) {
	spot := map[string]any{"needsNames": []any{"country", "region", "city"}}
	if msg, bad := MissingNames(spot, map[string]any{}); !bad || msg != "Your club opens a new country: name it" {
		t.Errorf("country = %q/%v", msg, bad)
	}
	full := map[string]any{"newCountry": map[string]any{}, "newRegion": map[string]any{}, "newTown": map[string]any{}}
	if _, bad := MissingNames(spot, full); bad {
		t.Error("complete names refused")
	}
	if _, bad := MissingNames(map[string]any{"needsNames": []any{}}, map[string]any{}); bad {
		t.Error("no needs refused")
	}
}

func TestDrawStartingBalanceRange(t *testing.T) {
	for i := 0; i < 200; i++ {
		v := drawStartingBalance()
		if v < 1_000_000 || v > 5_000_000 || int64(v)%100_000 != 0 {
			t.Fatalf("balance %v out of band", v)
		}
	}
}

func TestInvitesRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := db.New(context.Background(), url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	ctx := context.Background()

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		row, ok, err := one(ctx, tx, `SELECT "_id", "UserId" FROM "Clubs" WHERE "DistrictId" IS NOT NULL AND "UserId" IS NOT NULL LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no owned club with a district")
		}
		clubID, userID := mstr(row, "_id"), mstr(row, "UserId")
		invite, err := repo.CreateInvite(ctx, userID, clubID, false)
		if err != nil {
			t.Fatalf("create invite: %v", err)
		}
		if mstr(invite, "token") == "" || mint(invite, "usesLeft") != inviteUses {
			t.Errorf("invite = %v", invite)
		}
		list, err := repo.ListInvites(ctx, userID, clubID, false)
		if err != nil {
			t.Fatalf("list invites: %v", err)
		}
		if len(list) == 0 {
			t.Error("listInvites returned none after create")
		}
		// A foreign user is refused.
		if _, err := repo.CreateInvite(ctx, "00000000-0000-0000-0000-000000000000", clubID, false); err == nil {
			t.Error("foreign invite must be refused")
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back invites: %v", err)
	}
}

func TestFoundClubRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := db.New(context.Background(), url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	ctx := context.Background()

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		district, ok, err := one(ctx, tx, `SELECT "_id","ParentId","RegionId" FROM "Places" WHERE "Type" = 'district' AND "ParentId" IS NOT NULL LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no district")
		}
		districtID, cityID := mstr(district, "_id"), mstr(district, "ParentId")
		city, _, _ := one(ctx, tx, `SELECT * FROM "Places" WHERE "_id" = $1`, cityID)
		regionID := mstr(city, "RegionId")
		countryID := mstr(city, "ParentId")
		user, ok, err := one(ctx, tx, `SELECT "_id" FROM "Users" WHERE "isAdmin" = true LIMIT 1`)
		if err != nil || !ok {
			t.Skip("no admin user")
		}
		userID := mstr(user, "_id")

		spot := map[string]any{
			"kind": "hole", "districtId": districtID, "cityId": cityID, "regionId": nullable(regionID),
			"countryId": countryID, "needsNames": []any{}, "x": float64(100), "y": float64(100), "invite": nil,
		}
		body, _ := json.Marshal(spot)
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write(body)
		}))
		defer srv.Close()
		t.Setenv("WORLD_SERVICE_URL", srv.URL)

		name := fmt.Sprintf("Rollback FC %d", time.Now().UnixNano()%1000000)
		founded, err := repo.FoundClub(ctx, userID, map[string]any{
			"name": name, "code": "RBK",
			"crest": map[string]any{"shape": "circle", "pattern": "plain", "emblem": "ball", "primary": "#aabbcc", "secondary": "#112233", "trim": "#ffffff", "initials": ""},
		})
		if err != nil {
			t.Fatalf("foundClub: %v", err)
		}
		clubID := mstr(founded, "clubId")
		if clubID == "" {
			t.Fatal("no clubId")
		}
		if town, _ := founded["town"].(map[string]any); mstr(town, "id") != districtID {
			t.Errorf("town = %v", founded["town"])
		}

		club, _, _ := one(ctx, tx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, clubID)
		budget := mfloat(club, "Budget")
		if budget < 1_000_000 || budget > 5_000_000 {
			t.Errorf("starting balance = %v", budget)
		}
		if mstr(club, "DistrictId") != districtID {
			t.Errorf("district = %q", mstr(club, "DistrictId"))
		}
		program, ok, _ := one(ctx, tx, `SELECT * FROM "OwnerProgram" WHERE "ClubId" = $1`, clubID)
		if !ok || mstr(program, "Step") != "not_started" {
			t.Errorf("owner program = %v", program)
		}
		if msg, ok, _ := one(ctx, tx, `SELECT "_id" FROM "ClubMessages" WHERE "ClubId" = $1 LIMIT 1`, clubID); !ok || msg == nil {
			t.Error("no welcome club message")
		}

		// Founding the same name again is a 409.
		if _, err := repo.FoundClub(ctx, userID, map[string]any{
			"name": name, "code": "RBK",
			"crest": map[string]any{"shape": "circle", "pattern": "plain", "emblem": "ball", "primary": "#aabbcc", "secondary": "#112233", "trim": "#ffffff", "initials": ""},
		}); err == nil {
			t.Error("duplicate founding must 409")
		} else if fe, ok := err.(FoundingError); !ok || fe.Status != 409 {
			t.Errorf("duplicate error = %v", err)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back founding: %v", err)
	}
}

func TestFoundCountryTownRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := db.New(context.Background(), url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	ctx := context.Background()

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		user, ok, err := one(ctx, tx, `SELECT "_id" FROM "Users" WHERE "isAdmin" = true LIMIT 1`)
		if err != nil || !ok {
			t.Skip("no admin user")
		}
		userID := mstr(user, "_id")

		// A country far from every existing one.
		countries, _, _, err := repo.loadPlaces(ctx)
		if err != nil {
			return err
		}
		x := 8000.0
		if len(countries) > 0 {
			x = placePoint(countries[0]).x + 2000
		}
		country, err := repo.FoundCountry(ctx, userID, map[string]any{
			"name": "Rollbackland", "code": "RBK", "x": x, "y": float64(8000),
			"colors": []any{"#112233", "#445566"}, "motto": "Test",
		})
		if err != nil {
			t.Fatalf("foundCountry: %v", err)
		}
		countryID := mstr(country, "id")
		if countryID == "" || mstr(country, "code") != "RBK" {
			t.Errorf("country = %v", country)
		}
		town, err := repo.FoundTown(ctx, userID, map[string]any{
			"countryId": countryID, "name": "Rollbackton", "x": x, "y": float64(8000), "terrain": "coastal",
		})
		if err != nil {
			t.Fatalf("foundTown: %v", err)
		}
		if mstr(town, "name") != "Rollbackton" || mstr(town, "terrain") != "coastal" {
			t.Errorf("town = %v", town)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back country/town: %v", err)
	}
}
