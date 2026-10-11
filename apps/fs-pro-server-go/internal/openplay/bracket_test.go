package openplay

import "testing"

func TestTiesOf(t *testing.T) {
	round := []map[string]any{
		{"_id": "b2", "HomeTeamId": "A", "AwayTeamId": "B", "Leg": float64(2)},
		{"_id": "a1", "HomeTeamId": "B", "AwayTeamId": "A", "Leg": float64(1)},
		{"_id": "c1", "HomeTeamId": "C", "AwayTeamId": "D", "Leg": float64(1)},
	}
	ties := tiesOf(round)
	if len(ties) != 2 {
		t.Fatalf("ties = %d, want 2", len(ties))
	}
	// The A/B tie groups the two legs regardless of home/away, ordered by Leg.
	if len(ties[0]) != 2 || ties[0][0]["_id"] != "a1" || ties[0][1]["_id"] != "b2" {
		t.Errorf("first tie = %v", ties[0])
	}
	if len(ties[1]) != 1 || ties[1][0]["_id"] != "c1" {
		t.Errorf("second tie = %v", ties[1])
	}
}
