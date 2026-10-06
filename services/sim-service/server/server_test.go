package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"fs-pro-sim-service/engine"
	"fs-pro-sim-service/orchestrator"
)

func setupTestServer(t *testing.T) *Server {
	if err := engine.InitEngine(""); err != nil {
		t.Fatalf("InitEngine failed: %v", err)
	}
	pool := orchestrator.NewPool(4)
	return NewServer(pool)
}

func loadFixtureRequest(t *testing.T) []byte {
	poolPath := filepath.Join("..", "..", "..", "apps", "fs-pro-server", "src", "scripts", "fixtures", "simulation-roster-pool.json")
	poolBytes, err := os.ReadFile(poolPath)
	if err != nil {
		t.Skipf("Roster pool fixture not found: %v", err)
		return nil
	}

	var pool struct {
		Clubs []json.RawMessage `json:"clubs"`
	}
	json.Unmarshal(poolBytes, &pool)

	var club0, club1 struct {
		ID string `json:"_id"`
	}
	json.Unmarshal(pool.Clubs[0], &club0)
	json.Unmarshal(pool.Clubs[1], &club1)

	reqObj := map[string]interface{}{
		"fixtureId": "http_test_001",
		"clubs":     []json.RawMessage{pool.Clubs[0], pool.Clubs[1]},
		"sides": map[string]string{
			"home": club0.ID,
			"away": club1.ID,
		},
		"tactics": map[string]interface{}{
			"home": map[string]string{"formationName": "433", "styleName": "Balanced"},
			"away": map[string]string{"formationName": "442", "styleName": "Balanced"},
		},
		"seed": "http_test_seed",
	}

	b, _ := json.Marshal(reqObj)
	return b
}

func TestHealthEndpoint(t *testing.T) {
	srv := setupTestServer(t)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}

	var res map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &res)
	if res["status"] != "ok" {
		t.Fatalf("Unexpected status: %v", res)
	}
}

func TestSimulateMatchEndpoint(t *testing.T) {
	srv := setupTestServer(t)
	payload := loadFixtureRequest(t)
	if payload == nil {
		return
	}

	req := httptest.NewRequest("POST", "/sim/match", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var matchResp struct {
		OK        bool   `json:"ok"`
		FixtureID string `json:"fixtureId"`
		Match     struct {
			Details struct {
				HomeTeamScore int `json:"HomeTeamScore"`
				AwayTeamScore int `json:"AwayTeamScore"`
			} `json:"Details"`
			Events []interface{} `json:"Events"`
		} `json:"match"`
		Metrics struct {
			SimulationMs float64 `json:"simulationMs"`
		} `json:"metrics"`
	}

	if err := json.Unmarshal(w.Body.Bytes(), &matchResp); err != nil {
		t.Fatalf("Failed to parse match JSON: %v", err)
	}

	if !matchResp.OK {
		t.Fatalf("Match response not ok")
	}

	t.Logf("Simulated match via HTTP in %.2f ms (Score: %d-%d)",
		matchResp.Metrics.SimulationMs,
		matchResp.Match.Details.HomeTeamScore,
		matchResp.Match.Details.AwayTeamScore)
}

func TestSimulateBatchEndpoint(t *testing.T) {
	srv := setupTestServer(t)
	payload := loadFixtureRequest(t)
	if payload == nil {
		return
	}

	// Create 10 match requests in batch
	batch := make([]json.RawMessage, 10)
	for i := 0; i < 10; i++ {
		batch[i] = payload
	}
	batchBytes, _ := json.Marshal(batch)

	req := httptest.NewRequest("POST", "/sim/batch", bytes.NewReader(batchBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var batchResp orchestrator.BatchResult
	if err := json.Unmarshal(w.Body.Bytes(), &batchResp); err != nil {
		t.Fatalf("Failed to parse batch JSON: %v", err)
	}

	if batchResp.Successful != 10 {
		t.Fatalf("Expected 10 successful matches, got %d", batchResp.Successful)
	}

	t.Logf("Simulated batch of 10 matches in %.2f ms (Throughput: %.0f matches/sec)",
		batchResp.DurationMs, batchResp.Throughput)
}
