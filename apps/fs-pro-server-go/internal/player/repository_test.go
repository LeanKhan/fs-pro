package player

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// D9: excludeClubId must use `<>` (Node's ne), which also excludes NULL-ClubId
// free agents - not IS DISTINCT FROM.
func TestPlayerWhereExcludeClub(t *testing.T) {
	where, args := playerWhere(Filter{ExcludeClub: "c1", HasExclude: true})
	if !strings.Contains(where, `"ClubId" <> $1`) {
		t.Fatalf("excludeClubId where = %q", where)
	}
	if strings.Contains(where, "IS DISTINCT FROM") {
		t.Fatalf("excludeClubId must not use IS DISTINCT FROM: %q", where)
	}
	if len(args) != 1 || args[0] != "c1" {
		t.Fatalf("args = %v", args)
	}
}

func TestPlayerWhereRetiredExcludedByDefault(t *testing.T) {
	where, _ := playerWhere(Filter{})
	if !strings.Contains(where, `"isRetired" = false`) {
		t.Fatalf("retired must be excluded by default: %q", where)
	}
	where, _ = playerWhere(Filter{IncludeRetired: true})
	if strings.Contains(where, "isRetired") {
		t.Fatalf("IncludeRetired must not filter: %q", where)
	}
}

type recordingQuerier struct {
	sql  string
	args []any
}

func (q *recordingQuerier) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	q.sql, q.args = sql, args
	return nil, errors.New("stop")
}
func (q *recordingQuerier) QueryRow(context.Context, string, ...any) pgx.Row { return errRow{} }
func (q *recordingQuerier) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("stop")
}

type errRow struct{}

func (errRow) Scan(...any) error { return errors.New("stop") }

// D10: an explicitly-present empty competitionCode must still filter.
func TestGetSpecificPlayerStatsCompetitionFilter(t *testing.T) {
	rec := &recordingQuerier{}
	_, _ = GetSpecificPlayerStats(context.Background(), NewRepository(rec), "", true, "points", "desc")
	if !strings.Contains(rec.sql, `WHERE s."CompetitionCode" = $1`) {
		t.Fatalf("empty-but-present competitionCode must filter: %q", rec.sql)
	}
	if len(rec.args) != 1 || rec.args[0] != "" {
		t.Fatalf("args = %v", rec.args)
	}

	rec2 := &recordingQuerier{}
	_, _ = GetSpecificPlayerStats(context.Background(), NewRepository(rec2), "", false, "points", "desc")
	if strings.Contains(rec2.sql, "CompetitionCode") {
		t.Fatalf("absent competitionCode must not filter: %q", rec2.sql)
	}
}

func TestGetSpecificPlayerStatsSortAllowlist(t *testing.T) {
	rec := &recordingQuerier{}
	_, _ = GetSpecificPlayerStats(context.Background(), NewRepository(rec), "", false, "not_a_column; DROP", "asc")
	if strings.Contains(rec.sql, "DROP") {
		t.Fatalf("sortBy must be allowlisted: %q", rec.sql)
	}
	if !strings.Contains(rec.sql, "avg(d.\"Points\") ASC") {
		t.Fatalf("unknown sortBy must fall back to points: %q", rec.sql)
	}
}
