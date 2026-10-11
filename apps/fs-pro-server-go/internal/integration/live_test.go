// Package integration holds read-only tests that run against a real Postgres
// when DATABASE_URL is set. Every query here is a SELECT; nothing is written.
package integration

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/calendar"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/fixture"
	"fs-pro-server/internal/place"
	"fs-pro-server/internal/season"
)

func open(t *testing.T) *db.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := db.New(context.Background(), url, 10*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func TestLiveFixturesRead(t *testing.T) {
	pool := open(t)
	repo := fixture.NewRepository(pool)
	summary, err := repo.Summary(context.Background())
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	fixtures, err := repo.FindAll(context.Background(), fixture.Filter{HasScheduledDay: true, ScheduledDay: 1}, fixture.ReadOptions{Light: true})
	if err != nil {
		t.Fatalf("FindAll: %v", err)
	}
	t.Logf("schedule total=%d played=%d day1=%d", summary.Total, summary.Played, len(fixtures))
}

func TestLiveCalendarRead(t *testing.T) {
	pool := open(t)
	cal, err := calendar.NewRepository(pool).Calendar(context.Background())
	if err != nil {
		t.Fatalf("Calendar: %v", err)
	}
	if _, ok := cal["CurrentDay"]; !ok {
		t.Fatalf("calendar row missing CurrentDay: %v", cal)
	}
}

func TestLiveSeasonsRead(t *testing.T) {
	pool := open(t)
	seasons, err := season.NewRepository(pool).FindAll(context.Background(), season.Filter{})
	if err != nil {
		t.Fatalf("FindAll: %v", err)
	}
	t.Logf("seasons=%d", len(seasons))
}

func TestLivePlacesRead(t *testing.T) {
	pool := open(t)
	places, err := place.NewRepository(pool).FindAll(context.Background(), place.Filter{Type: "country", HasType: true})
	if err != nil {
		t.Fatalf("FindAll: %v", err)
	}
	t.Logf("countries=%d", len(places))
}

func TestLiveUsersClubsRead(t *testing.T) {
	pool := open(t)
	rows, err := pool.Query(context.Background(), `SELECT "_id" FROM "Users" LIMIT 1`)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	defer rows.Close()
	if !rows.Next() {
		t.Skip("no users seeded")
	}
}
