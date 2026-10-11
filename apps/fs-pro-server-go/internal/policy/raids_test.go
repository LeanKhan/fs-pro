package policy

import "testing"

// TestRaidRoutesAreOwnerScoped pins the two P5 raid routes as Club rules on the
// clubId path param, so a future table edit cannot silently make them public.
func TestRaidRoutesAreOwnerScoped(t *testing.T) {
	for _, id := range []string{"play.claimBoardVault", "play.defenseLog"} {
		rule, ok := Table[id]
		if !ok {
			t.Fatalf("%s is not in the policy table", id)
		}
		if rule.Kind != Club || rule.Source != SourceParam || rule.Field != "clubId" {
			t.Fatalf("%s rule = %+v, want Club/param/clubId", id, rule)
		}
	}
}
