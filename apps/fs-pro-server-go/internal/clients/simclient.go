package clients

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// DefaultSimServiceURL is the sim service's local-dev default.
const DefaultSimServiceURL = "http://localhost:5050"

// SimServiceURL resolves SIM_SERVICE_URL with a localhost fallback.
func SimServiceURL() string {
	if v := os.Getenv("SIM_SERVICE_URL"); v != "" {
		return v
	}
	return DefaultSimServiceURL
}

// SimulateBatch posts a list of SimulateMatchRequests to the sim service's
// /sim/batch and returns the `results` array.
func SimulateBatch(ctx context.Context, requests []map[string]any) ([]map[string]any, error) {
	body, err := json.Marshal(requests)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, SimServiceURL()+"/sim/batch", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 25 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("sim service POST /sim/batch failed (%d)", resp.StatusCode)
	}
	out := map[string]any{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	results, _ := out["results"].([]any)
	list := make([]map[string]any, 0, len(results))
	for _, r := range results {
		if m, ok := r.(map[string]any); ok {
			list = append(list, m)
		}
	}
	return list, nil
}

// SimulateMatch posts a SimulateMatchRequest to the sim service and returns the
// `match` object from its response (the rust-sim-core contract).
func SimulateMatch(ctx context.Context, request map[string]any) (map[string]any, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, SimServiceURL()+"/sim/match", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("sim service POST /sim/match failed (%d): %s", resp.StatusCode, string(raw))
	}
	out := map[string]any{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("sim service returned invalid JSON: %w", err)
	}
	if ok, _ := out["ok"].(bool); !ok {
		return nil, fmt.Errorf("simulation failed: %v", out["error"])
	}
	match, _ := out["match"].(map[string]any)
	if match == nil {
		return nil, fmt.Errorf("simulation returned no match")
	}
	return match, nil
}
