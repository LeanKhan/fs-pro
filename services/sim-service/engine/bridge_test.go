package engine

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestEngineBridge(t *testing.T) {
	err := InitEngine("")
	if err != nil {
		t.Fatalf("InitEngine failed: %v", err)
	}

	// Read simulation-roster-pool fixture
	poolPath := filepath.Join("..", "..", "..", "apps", "fs-pro-server", "src", "scripts", "fixtures", "simulation-roster-pool.json")
	poolBytes, err := os.ReadFile(poolPath)
	if err != nil {
		t.Skipf("Roster pool fixture not found at %s: %v", poolPath, err)
		return
	}

	var pool struct {
		Clubs []json.RawMessage `json:"clubs"`
	}
	if err := json.Unmarshal(poolBytes, &pool); err != nil {
		t.Fatalf("Failed to unmarshal roster pool: %v", err)
	}
	if len(pool.Clubs) < 2 {
		t.Fatalf("Need at least 2 clubs, found %d", len(pool.Clubs))
	}

	var club0, club1 struct {
		ID string `json:"_id"`
	}
	json.Unmarshal(pool.Clubs[0], &club0)
	json.Unmarshal(pool.Clubs[1], &club1)

	reqObj := map[string]interface{}{
		"fixtureId": "go_test_001",
		"clubs":     []json.RawMessage{pool.Clubs[0], pool.Clubs[1]},
		"sides": map[string]string{
			"home": club0.ID,
			"away": club1.ID,
		},
		"tactics": map[string]interface{}{
			"home": map[string]string{"formationName": "433", "styleName": "Balanced"},
			"away": map[string]string{"formationName": "442", "styleName": "Balanced"},
		},
		"seed": "go_bridge_seed_123",
	}

	reqBytes, err := json.Marshal(reqObj)
	if err != nil {
		t.Fatalf("Failed to marshal request: %v", err)
	}

	respBytes, err := SimulateMatch(reqBytes)
	if err != nil {
		t.Fatalf("SimulateMatch failed: %v", err)
	}

	var resp struct {
		OK        bool   `json:"ok"`
		FixtureID string `json:"fixtureId"`
		Match     struct {
			Details struct {
				HomeTeamScore int `json:"HomeTeamScore"`
				AwayTeamScore int `json:"AwayTeamScore"`
			} `json:"Details"`
			Events []interface{} `json:"Events"`
			Frames struct {
				Format string `json:"format"`
				Tick   []int  `json:"tick"`
			} `json:"Frames"`
		} `json:"match"`
		Metrics struct {
			SimulationMs float64 `json:"simulationMs"`
			TotalMs      float64 `json:"totalMs"`
		} `json:"metrics"`
		Error string `json:"error"`
	}

	if err := json.Unmarshal(respBytes, &resp); err != nil {
		t.Fatalf("Failed to parse response JSON: %v (raw: %s)", err, string(respBytes))
	}

	if !resp.OK {
		t.Fatalf("Simulation returned error: %s", resp.Error)
	}

	if resp.Match.Frames.Format != "packed-v1" || len(resp.Match.Frames.Tick) != 720 || len(resp.Match.Events) == 0 {
		t.Fatalf("expected a full match under `match` (packed, 720 frames, events), got %q %d frames, %d events", resp.Match.Frames.Format, len(resp.Match.Frames.Tick), len(resp.Match.Events))
	}

	t.Logf("Go Bridge successfully simulated match %s in %.2f ms", resp.FixtureID, resp.Metrics.SimulationMs)
	t.Logf("Result: %d - %d, Events: %d, Frames: %d",
		resp.Match.Details.HomeTeamScore,
		resp.Match.Details.AwayTeamScore,
		len(resp.Match.Events),
		len(resp.Match.Frames.Tick))
}
