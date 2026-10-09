package play

import "testing"

func TestGateProblem(t *testing.T) {
	cases := []struct {
		name      string
		managerID string
		total     int
		gk        int
		wantCode  string
	}{
		{"ok", "m1", 11, 1, ""},
		{"no manager", "", 20, 2, "no_manager"},
		{"no keeper", "m1", 20, 0, "no_keeper"},
		{"small squad", "m1", 10, 1, "no_squad"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			refusal := GateProblem(tc.managerID, tc.total, tc.gk)
			if tc.wantCode == "" {
				if refusal != nil {
					t.Fatalf("expected allowed, got %+v", refusal)
				}
				return
			}
			if refusal == nil || refusal.Code != tc.wantCode {
				t.Fatalf("got %+v, want code %s", refusal, tc.wantCode)
			}
		})
	}
}

func TestPowerAndLevel(t *testing.T) {
	if power(75) != 188 {
		t.Fatalf("power(75) = %d, want 188", power(75))
	}
	level, into, next := levelInfo([]float64{0, 100, 300}, 150)
	if level != 3 || into != 50 || next != 200 {
		t.Fatalf("levelInfo = (%d,%v,%v)", level, into, next)
	}
}
