package play

import (
	"encoding/json"
	"testing"
)

// TestApplyPlayerEffectsCarriesTrigger pins the sim-request effects payload
// (OW-P03): the resolved effect items are attached verbatim, so an ability's
// optional match-context `trigger` reaches sim-core intact. This is the Go half
// of the contract `RawEffect { kind, params, trigger? }`.
func TestApplyPlayerEffectsCarriesTrigger(t *testing.T) {
	players := []any{map[string]any{"_id": "p1"}, map[string]any{"_id": "p2"}}
	effects := map[string][]any{
		"p1": {
			map[string]any{
				"kind":    "NewAction",
				"params":  map[string]any{"action": float64(4)},
				"trigger": map[string]any{"when": "leading"},
			},
			map[string]any{
				"kind":   "CrossType",
				"params": map[string]any{"inswing": float64(1)},
			},
		},
	}
	applyPlayerEffects(players, effects)

	raw, err := json.Marshal(players[0])
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got struct {
		Effects []struct {
			Kind    string         `json:"kind"`
			Trigger map[string]any `json:"trigger"`
		} `json:"effects"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(got.Effects) != 2 {
		t.Fatalf("effects = %d, want 2 (payload not attached verbatim)", len(got.Effects))
	}
	if got.Effects[0].Trigger == nil || got.Effects[0].Trigger["when"] != "leading" {
		t.Errorf("effect trigger lost in the sim payload: %s", raw)
	}
	if got.Effects[1].Trigger != nil {
		t.Errorf("trigger-free effect must not gain a trigger: %s", raw)
	}
	// A player with no resolved effects is left untouched (the parity case).
	if _, ok := players[1].(map[string]any)["effects"]; ok {
		t.Error("effects were attached to a player that had none")
	}
}
