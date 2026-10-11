package main

import (
	"context"
	"reflect"
	"testing"
)

// TestFakeSimIsDeterministic pins the load test's repeatability: the fake
// simulator is a pure function of the frozen request's seed, so a fixed-seed
// replay yields the same match (05 §6) and the load test's numbers are
// comparable run to run.
func TestFakeSimIsDeterministic(t *testing.T) {
	req := func(seed string) map[string]any { return map[string]any{"seed": seed} }

	a, err := fakeSim(context.Background(), req("load-000001"))
	if err != nil {
		t.Fatalf("fakeSim: %v", err)
	}
	b, err := fakeSim(context.Background(), req("load-000001"))
	if err != nil {
		t.Fatalf("fakeSim: %v", err)
	}
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("same seed produced different matches:\n a=%v\n b=%v", a, b)
	}
	if a["Details"].(map[string]any)["HomeTeamScore"] != b["Details"].(map[string]any)["HomeTeamScore"] {
		t.Fatal("scores differ across identical runs")
	}

	// Different seeds should not all collapse to one result.
	seen := map[int]bool{}
	for i := 0; i < 32; i++ {
		m, err := fakeSim(context.Background(), req(string(rune('a'+i))))
		if err != nil {
			t.Fatalf("fakeSim: %v", err)
		}
		seen[m["Details"].(map[string]any)["HomeTeamScore"].(int)] = true
	}
	if len(seen) < 2 {
		t.Fatalf("fakeSim produced only one score across seeds: %v", seen)
	}
}

// TestFakeSimShape proves the fake returns exactly the fields the raid
// resolution reads (goals + dominance inputs), so the DB path is exercised.
func TestFakeSimShape(t *testing.T) {
	m, err := fakeSim(context.Background(), map[string]any{"seed": "shape"})
	if err != nil {
		t.Fatalf("fakeSim: %v", err)
	}
	details, ok := m["Details"].(map[string]any)
	if !ok {
		t.Fatalf("no Details map: %#v", m)
	}
	for _, key := range []string{"HomeTeamScore", "AwayTeamScore", "HomeTeamDetails", "AwayTeamDetails"} {
		if _, ok := details[key]; !ok {
			t.Errorf("Details missing %q: %#v", key, details)
		}
	}
	for _, side := range []string{"HomeTeamDetails", "AwayTeamDetails"} {
		d, ok := details[side].(map[string]any)
		if !ok {
			t.Fatalf("%s not a map", side)
		}
		if _, ok := d["Possession"]; !ok {
			t.Errorf("%s missing Possession", side)
		}
		if _, ok := d["XG"]; !ok {
			t.Errorf("%s missing XG", side)
		}
	}
}

// TestDatabaseNameHelpers pins the throwaway-DB plumbing (the same helpers
// cmd/dod uses) so the load test never runs against the template database.
func TestDatabaseNameHelpers(t *testing.T) {
	dsn := "postgresql://fspro:superpassword@localhost:5434/fspro_scratch"
	if got := databaseName(dsn); got != "fspro_scratch" {
		t.Fatalf("databaseName = %q", got)
	}
	if got := replaceDatabase(dsn, "fspro_loadtest"); got != "postgresql://fspro:superpassword@localhost:5434/fspro_loadtest" {
		t.Fatalf("replaceDatabase = %q", got)
	}
	if got := quoteIdent(`weird"name`); got != `"weird""name"` {
		t.Fatalf("quoteIdent = %q", got)
	}
}
