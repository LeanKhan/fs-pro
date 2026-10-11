package program

import "testing"

func TestProgramXpFromStarsValue(t *testing.T) {
	got := ProgramXpFromStars(map[string]any{"manager": float64(3), "players": float64(2)}, "players")
	if got != 18 {
		t.Errorf("xp excluding players = %d, want 18", got)
	}
	if got := ProgramXpFromStars(map[string]any{"a": 3, "b": 3, "c": 3, "d": 3}, ""); got != 54 {
		t.Errorf("xp cap = %d, want 54", got)
	}
	if got := ProgramXpFromStars(map[string]any{}, "manager"); got != 0 {
		t.Errorf("empty = %d", got)
	}
}
