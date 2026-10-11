package club

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestBoolParam(t *testing.T) {
	q := map[string][]string{"a": {"true"}, "b": {"false"}, "c": {""}, "d": {"1"}}
	cases := map[string]struct {
		value   bool
		present bool
	}{
		"a": {true, true},
		"b": {false, true},
		"c": {false, true}, // present-but-empty is falsy, matching Node's ??
		"d": {false, true}, // "1" is no longer accepted but is still "present"
		"e": {false, false},
	}
	for key, want := range cases {
		got, present := boolParam(q, key)
		if got != want.value || present != want.present {
			t.Fatalf("boolParam(%q) = (%v,%v), want (%v,%v)", key, got, present, want.value, want.present)
		}
	}
}

type scriptedRow struct{ vals []any }

func (r scriptedRow) Scan(dest ...any) error {
	for i, d := range dest {
		v := r.vals[i]
		switch p := d.(type) {
		case *int:
			if v == nil {
				return errors.New("unexpected null int")
			}
			*p = v.(int)
		case **time.Time:
			if v == nil {
				*p = nil
			} else {
				tt := v.(time.Time)
				*p = &tt
			}
		default:
			return fmt.Errorf("scriptedRow: unsupported scan dest %T", d)
		}
	}
	return nil
}

type scriptedQuerier struct{ rows [][]any }

func (q *scriptedQuerier) QueryRow(context.Context, string, ...any) pgx.Row {
	row := q.rows[0]
	q.rows = q.rows[1:]
	return scriptedRow{vals: row}
}
func (q *scriptedQuerier) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("not scripted")
}
func (q *scriptedQuerier) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("not scripted")
}

func TestYouthRefusalNoAcademy(t *testing.T) {
	q := &scriptedQuerier{rows: [][]any{{0}}}
	if got := youthRefusal(context.Background(), q, "c1"); got != "Build a Youth Academy to bring through your own players" {
		t.Fatalf("tier 0 = %q", got)
	}
}

func TestYouthRefusalFullSquad(t *testing.T) {
	q := &scriptedQuerier{rows: [][]any{{1}, {28}}}
	if got := youthRefusal(context.Background(), q, "c1"); got != "Your squad is full (28 players)" {
		t.Fatalf("full squad = %q", got)
	}
}

func TestYouthRefusalCooldown(t *testing.T) {
	q := &scriptedQuerier{rows: [][]any{{2}, {5}, {time.Now().Add(-time.Minute)}}}
	got := youthRefusal(context.Background(), q, "c1")
	if !strings.HasPrefix(got, "The academy's next prospect is ready in") {
		t.Fatalf("cooldown = %q", got)
	}
}

func TestYouthRefusalAllowed(t *testing.T) {
	q := &scriptedQuerier{rows: [][]any{{1}, {5}, {nil}}}
	if got := youthRefusal(context.Background(), q, "c1"); got != "" {
		t.Fatalf("expected allowed, got %q", got)
	}
}

func TestScaledHoursAndDescribe(t *testing.T) {
	t.Setenv("GAME_TIME_SCALE", "")
	if scaledHours(24) != 24 {
		t.Fatalf("scaledHours default = %v", scaledHours(24))
	}
	if describeHours(1) != "1 hour" || describeHours(0.5) != "30 minutes" {
		t.Fatalf("describeHours = %q / %q", describeHours(1), describeHours(0.5))
	}
}
