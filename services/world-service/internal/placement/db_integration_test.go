package placement

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"fs-pro-world-service/internal/db"
)

// PLACEMENT_LOCK mirrors services/world/placement.service.ts:34
// (0x46535050, "FSPP"). The test takes it exactly as Node does.
const placementLock = 0x46535050

const testClubCount = 200

// TestConcurrentFoundingsScratchDB runs 200 foundings through the same
// advisory-lock semantics as Node's founding transaction and asserts no
// district overfills. It needs a scratch database migrated to 0038:
//
//	WORLD_TEST_DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_b2a \
//	  go test ./internal/placement -run Concurrent -v
//
// It skips (does not fail) when the variable is unset, so `go test ./...` stays
// hermetic.
func TestConcurrentFoundingsScratchDB(t *testing.T) {
	url := os.Getenv("WORLD_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set WORLD_TEST_DATABASE_URL to a scratch DB to run the concurrency test")
	}

	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatalf("parse config: %v", err)
	}
	cfg.MaxConns = 16
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	cleanup(t, ctx, pool)

	capSettings, err := New(pool).Settings(ctx)
	if err != nil {
		t.Fatalf("settings: %v", err)
	}

	var wg sync.WaitGroup
	errs := make(chan error, testClubCount)
	for i := 0; i < testClubCount; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := foundOne(ctx, pool, i); err != nil {
				errs <- fmt.Errorf("founding %d: %w", i, err)
			}
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}

	// Every test club exists and points at a district.
	var total, nullDistrict int
	if err := pool.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE "DistrictId" IS NULL) FROM "Clubs" WHERE "Name" LIKE 'B2A-%'`).Scan(&total, &nullDistrict); err != nil {
		t.Fatalf("count clubs: %v", err)
	}
	if total != testClubCount {
		t.Fatalf("inserted %d clubs, want %d", total, testClubCount)
	}
	if nullDistrict != 0 {
		t.Fatalf("%d test clubs have a null district", nullDistrict)
	}

	// No district exceeds the cap.
	var overfilled int
	err = pool.QueryRow(ctx, `
SELECT count(*) FROM (
  SELECT "DistrictId", count(*) AS n FROM "Clubs"
  WHERE "Name" LIKE 'B2A-%' AND "DistrictId" IS NOT NULL
  GROUP BY "DistrictId"
) x WHERE x.n > $1`, capSettings.DistrictClubs).Scan(&overfilled)
	if err != nil {
		t.Fatalf("overfill check: %v", err)
	}
	if overfilled != 0 {
		t.Fatalf("%d districts exceed DistrictClubs=%d", overfilled, capSettings.DistrictClubs)
	}

	// PlaceStats matches GROUP BY for the districts the test used (the trigger
	// must have kept the projection correct through 200 concurrent commits).
	var mismatched int
	err = pool.QueryRow(ctx, `
SELECT count(*) FROM "Places" d
WHERE d."Type" = 'district'
  AND coalesce((SELECT ps."Clubs" FROM "PlaceStats" ps WHERE ps."PlaceId" = d."_id"), -1)
      IS DISTINCT FROM (SELECT count(*) FROM "Clubs" c WHERE c."DistrictId" = d."_id")`).Scan(&mismatched)
	if err != nil {
		t.Fatalf("place stats check: %v", err)
	}
	if mismatched != 0 {
		t.Fatalf("%d districts have a stale PlaceStats row", mismatched)
	}

	t.Logf("placed %d clubs under PLACEMENT_LOCK; cap=%d, no overfill, PlaceStats consistent",
		total, capSettings.DistrictClubs)
}

// foundOne is one founding transaction: take PLACEMENT_LOCK, ask for a spot,
// create the places it opens, insert the club, commit - the same boundary Node
// uses (WORLD-HIERARCHY-SPEC §4.3).
func foundOne(ctx context.Context, pool *pgxpool.Pool, i int) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, placementLock); err != nil {
		return err
	}

	// Bind the placement service to the transaction so its reads see the
	// previous founding's committed state (and never need a second
	// connection while the lock is held).
	svc := New(tx)
	spot, err := svc.Spot(ctx, fmt.Sprintf("B2A-%d", i), "")
	if err != nil {
		return err
	}

	districtID, countryID, err := openPlaces(ctx, tx, spot, i)
	if err != nil {
		return err
	}

	name := fmt.Sprintf("B2A-%d", i)
	code := fmt.Sprintf("B2A%04d", i)
	_, err = tx.Exec(ctx, `
INSERT INTO "Clubs" ("Name", "ClubCode", "DistrictId", "AddressCountryId", "updatedAt")
VALUES ($1, $2, $3::uuid, $4::uuid, now())`, name, code, districtID, countryID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// openPlaces mirrors club-founding.service.ts's openPlaces for the test: it
// creates whichever levels the spot needs and returns the leaf district and
// country.
func openPlaces(ctx context.Context, tx pgx.Tx, spot Spot, i int) (districtID, countryID string, err error) {
	point := func() (float64, float64) { return spot.X, spot.Y }

	insertPlace := func(name, code, typ, parent, region string, x, y float64) (string, error) {
		var id string
		err := tx.QueryRow(ctx, `
INSERT INTO "Places" ("Fullname","Name","Code","Type","ParentId","RegionId","MapX","MapY","Region","updatedAt")
VALUES ($1,$2,$3,$4,NULLIF($5,'')::uuid,NULLIF($6,'')::uuid,$7,$8,'world',now())
RETURNING "_id"::text`,
			name+", B2A", name, code, typ, parent, region, x, y).Scan(&id)
		return id, err
	}

	switch spot.Kind {
	case "hole":
		if spot.DistrictID == nil {
			return "", "", errors.New("hole without a districtId")
		}
		cid := ""
		if spot.CountryID != nil {
			cid = *spot.CountryID
		}
		return *spot.DistrictID, cid, nil

	case "district":
		if spot.CityID == nil || spot.CountryID == nil {
			return "", "", errors.New("district without a cityId/countryId")
		}
		region := ""
		if spot.RegionID != nil {
			region = *spot.RegionID
		}
		x, y := point()
		did, err := insertPlace(fmt.Sprintf("B2A-D-%d", i), fmt.Sprintf("B2AD%04d", i), "district", *spot.CityID, region, x, y)
		return did, *spot.CountryID, err

	case "city":
		if spot.RegionID == nil || spot.CountryID == nil {
			return "", "", errors.New("city without a regionId/countryId")
		}
		x, y := point()
		cid, err := insertPlace(fmt.Sprintf("B2A-C-%d", i), fmt.Sprintf("B2AC%04d", i), "city", *spot.CountryID, *spot.RegionID, x, y)
		if err != nil {
			return "", "", err
		}
		did, err := insertPlace(fmt.Sprintf("B2A-D-%d", i), fmt.Sprintf("B2AD%04d", i), "district", cid, *spot.RegionID, x, y)
		return did, *spot.CountryID, err

	case "region":
		if spot.CountryID == nil {
			return "", "", errors.New("region without a countryId")
		}
		x, y := point()
		rid, err := insertPlace(fmt.Sprintf("B2A-R-%d", i), fmt.Sprintf("B2AR%04d", i), "region", *spot.CountryID, "", x, y)
		if err != nil {
			return "", "", err
		}
		cid, err := insertPlace(fmt.Sprintf("B2A-C-%d", i), fmt.Sprintf("B2AC%04d", i), "city", *spot.CountryID, rid, x, y)
		if err != nil {
			return "", "", err
		}
		did, err := insertPlace(fmt.Sprintf("B2A-D-%d", i), fmt.Sprintf("B2AD%04d", i), "district", cid, rid, x, y)
		return did, *spot.CountryID, err

	case "country":
		x, y := point()
		ccid, err := insertPlace(fmt.Sprintf("B2A-K-%d", i), fmt.Sprintf("B2AK%04d", i), "country", "", "", x, y)
		if err != nil {
			return "", "", err
		}
		rid, err := insertPlace(fmt.Sprintf("B2A-R-%d", i), fmt.Sprintf("B2AR%04d", i), "region", ccid, "", x, y)
		if err != nil {
			return "", "", err
		}
		cid, err := insertPlace(fmt.Sprintf("B2A-C-%d", i), fmt.Sprintf("B2AC%04d", i), "city", ccid, rid, x, y)
		if err != nil {
			return "", "", err
		}
		did, err := insertPlace(fmt.Sprintf("B2A-D-%d", i), fmt.Sprintf("B2AD%04d", i), "district", cid, rid, x, y)
		return did, ccid, err

	default:
		return "", "", fmt.Errorf("unknown spot kind %q", spot.Kind)
	}
}

// cleanup removes rows from a previous run of this test. Scratch DB only.
func cleanup(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	stmts := []string{
		`DELETE FROM "Clubs" WHERE "Name" LIKE 'B2A-%'`,
		`DELETE FROM "PlaceStats" WHERE "PlaceId" IN (SELECT "_id" FROM "Places" WHERE "Name" LIKE 'B2A %')`,
		`DELETE FROM "Places" WHERE "Type"='district' AND "Name" LIKE 'B2A %'`,
		`DELETE FROM "Places" WHERE "Type"='city' AND "Name" LIKE 'B2A %'`,
		`DELETE FROM "Places" WHERE "Type"='region' AND "Name" LIKE 'B2A %'`,
		`DELETE FROM "Places" WHERE "Type"='country' AND "Name" LIKE 'B2A %'`,
	}
	for _, s := range stmts {
		if _, err := pool.Exec(ctx, s); err != nil {
			if strings.Contains(err.Error(), "does not exist") {
				t.Skipf("scratch DB is missing the 0038 schema (run migration first): %v", err)
			}
			t.Fatalf("cleanup %q: %v", s, err)
		}
	}
}

// compile-time assertion that the db.Querier surface is what the test relies on.
var _ db.Querier = (pgx.Tx)(nil)

// TestInvitePlacementScratchDB covers the invite branch of Spot against a
// scratch DB: a valid district invite is honoured and reported; an expired one
// is ignored. Same env gate as the concurrency test.
func TestInvitePlacementScratchDB(t *testing.T) {
	url := os.Getenv("WORLD_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set WORLD_TEST_DATABASE_URL to a scratch DB to run the invite test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	// A district with room and any club as the inviter.
	svc := New(pool)
	capSettings, err := svc.Settings(ctx)
	if err != nil {
		t.Fatalf("settings: %v", err)
	}

	var districtID, clubID string
	err = pool.QueryRow(ctx, `
SELECT d."_id"::text, (SELECT "_id"::text FROM "Clubs" LIMIT 1)
FROM "Places" d
WHERE d."Type"='district'
  AND coalesce((SELECT ps."Clubs" FROM "PlaceStats" ps WHERE ps."PlaceId"=d."_id"), 0) < $1
LIMIT 1`, capSettings.DistrictClubs).Scan(&districtID, &clubID)
	if err != nil {
		t.Skipf("scratch DB has no usable district/club (run 0038 first): %v", err)
	}

	const token = "B2A-INVITE-TEST"
	_, _ = pool.Exec(ctx, `DELETE FROM "PlaceInvites" WHERE "Token"=$1`, token)
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM "PlaceInvites" WHERE "Token"=$1`, token) }()

	_, err = pool.Exec(ctx, `
INSERT INTO "PlaceInvites" ("Token","PlaceId","ByClubId","Level","ExpiresAt","MaxUses","Uses")
VALUES ($1,$2::uuid,$3::uuid,'district', now() + interval '1 day', 5, 0)`, token, districtID, clubID)
	if err != nil {
		t.Fatalf("seed invite: %v", err)
	}

	spot, err := svc.Spot(ctx, "B2A-invitee", token)
	if err != nil {
		t.Fatalf("spot: %v", err)
	}
	if spot.Invite == nil || spot.Invite.Level != "district" {
		t.Fatalf("valid invite not honoured: %+v", spot)
	}
	if spot.Kind != "hole" || spot.DistrictID == nil || *spot.DistrictID != districtID {
		t.Fatalf("invite should land in the invited district, got %+v", spot)
	}

	// Expire it: the invite must be dropped and normal placement used.
	if _, err := pool.Exec(ctx, `UPDATE "PlaceInvites" SET "ExpiresAt"=now() - interval '1 day' WHERE "Token"=$1`, token); err != nil {
		t.Fatal(err)
	}
	spot, err = svc.Spot(ctx, "B2A-invitee", token)
	if err != nil {
		t.Fatalf("spot after expiry: %v", err)
	}
	if spot.Invite != nil {
		t.Fatalf("expired invite was honoured: %+v", spot)
	}
}
