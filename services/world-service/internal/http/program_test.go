package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"
)

func evaluateBody(step string) string {
	facts := map[string]any{
		"step":            step,
		"startingBalance": 3_000_000,
		"budget":          1_000_000,
		"manager":         map[string]any{"overall": 62, "signingFee": 360000, "contractYears": 3},
		"squad":           map[string]any{"total": 13, "gk": 2, "def": 4, "mid": 4, "att": 3, "medianRating": 56},
		"assets":          []any{map[string]any{"type": "training_ground", "tier": 1, "upgradingTo": nil, "hasEffect": true}},
		"programXp":       36,
		"clubXp":          100,
		"friendlies":      map[string]any{"wins": 2, "draws": 0, "losses": 0},
		"scout":           map[string]any{"managersBrowsed": 0, "interviewedManagerIds": []string{}, "scoutedPlayerIds": []string{}},
		"events":          map[string]any{"playBlocked": false, "sessionMinutes": 0, "programCompletedOnce": false},
	}
	body, _ := json.Marshal(map[string]any{"step": step, "facts": facts})
	return string(body)
}

func TestProgramStepsEndpoint(t *testing.T) {
	srv := newTestServer(t, Deps{}, nil)
	rec := do(t, srv, http.MethodGet, "/program/steps", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	steps, ok := out["steps"].([]any)
	if !ok || len(steps) != 4 {
		t.Fatalf("steps = %v", out["steps"])
	}
	if out["programXpCap"].(float64) != 54 {
		t.Fatalf("programXpCap = %v", out["programXpCap"])
	}
}

func TestProgramEvaluateEndpoint(t *testing.T) {
	srv := newTestServer(t, Deps{}, nil)
	for _, step := range []string{"manager", "players", "facilities", "level1"} {
		rec := do(t, srv, http.MethodPost, "/program/evaluate", evaluateBody(step))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: status = %d body %s", step, rec.Code, rec.Body.String())
		}
		var out map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if _, ok := out["stars"]; !ok {
			t.Fatalf("%s: missing stars in %s", step, rec.Body.String())
		}
	}
}

func TestProgramEvaluateValidation(t *testing.T) {
	srv := newTestServer(t, Deps{}, nil)
	tests := []struct {
		name string
		body string
	}{
		{"invalid json", "{not json"},
		{"empty body", ""},
		{"unknown step", evaluateBody("nope")},
		{"step mismatch", `{"step":"manager","facts":{"step":"players"}}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, srv, http.MethodPost, "/program/evaluate", tt.body)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestProgramNextEndpoint(t *testing.T) {
	srv := newTestServer(t, Deps{}, nil)
	rec := do(t, srv, http.MethodPost, "/program/next", evaluateBody("manager"))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out["nextStep"].(string) != "players" {
		t.Fatalf("nextStep = %v, want players", out["nextStep"])
	}
}

func TestProgramTipEndpoint(t *testing.T) {
	srv := newTestServer(t, Deps{}, nil)
	body := fmt.Sprintf(`{"facts":%s,"advisor":{"shows":{},"lastShownAt":{},"dismissed":[],"quiet":false},"now":1000000}`,
		extractFacts(evaluateBody("manager")))
	rec := do(t, srv, http.MethodPost, "/program/tip", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out["tip"] == nil {
		t.Fatalf("expected a tip, got null")
	}
	// now <= 0 is rejected.
	bad := fmt.Sprintf(`{"facts":%s,"advisor":{"shows":{},"lastShownAt":{},"dismissed":[]},"now":0}`, extractFacts(evaluateBody("manager")))
	rec = do(t, srv, http.MethodPost, "/program/tip", bad)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("zero now: status = %d, want 400", rec.Code)
	}
}

// extractFacts pulls the "facts" object out of an evaluate body.
func extractFacts(body string) string {
	var m map[string]json.RawMessage
	_ = json.Unmarshal([]byte(body), &m)
	return string(m["facts"])
}

func TestProgramSimulateEndpoint(t *testing.T) {
	srv := newTestServer(t, Deps{}, nil)
	body := `{"balance":1000000,"strategy":"balanced_expert","runs":50,"seed":7}`
	rec := do(t, srv, http.MethodPost, "/program/simulate", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out["strategy"].(string) != "balanced_expert" {
		t.Fatalf("strategy = %v", out["strategy"])
	}
	if _, ok := out["timeToLevel1Minutes"]; !ok {
		t.Fatalf("missing timeToLevel1Minutes: %s", rec.Body.String())
	}
	if out["softLocked"].(float64) != 0 {
		t.Fatalf("softLocked = %v, want 0", out["softLocked"])
	}

	tests := []struct {
		name string
		body string
	}{
		{"bad strategy", `{"balance":1000000,"strategy":"yolo","runs":5,"seed":1}`},
		{"balance low", `{"balance":10,"strategy":"random","runs":5,"seed":1}`},
		{"balance high", `{"balance":90000000,"strategy":"random","runs":5,"seed":1}`},
		{"runs zero", `{"balance":1000000,"strategy":"random","runs":0,"seed":1}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, srv, http.MethodPost, "/program/simulate", tt.body)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (%s)", rec.Code, rec.Body.String())
			}
		})
	}
}

// TestProgramConcurrentEndpoints exercises the pure handlers from many
// goroutines so `go test -race` can prove there is no shared mutable state.
func TestProgramConcurrentEndpoints(t *testing.T) {
	srv := newTestServer(t, Deps{}, nil)
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			step := []string{"manager", "players", "facilities", "level1"}[i%4]
			if rec := do(t, srv, http.MethodPost, "/program/evaluate", evaluateBody(step)); rec.Code != http.StatusOK {
				t.Errorf("evaluate status %d", rec.Code)
			}
			body := fmt.Sprintf(`{"balance":%d,"strategy":"random","runs":10,"seed":%d}`, 1_000_000+i*100_000, i)
			if rec := do(t, srv, http.MethodPost, "/program/simulate", body); rec.Code != http.StatusOK {
				t.Errorf("simulate status %d", rec.Code)
			}
			_ = do(t, srv, http.MethodGet, "/program/steps", "")
		}(i)
	}
	wg.Wait()
}
