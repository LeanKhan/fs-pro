package policy

import "testing"

// TestPreseasonRoutesAreOwnerScoped pins the three P9 Pre-Season Tour routes as
// Club rules on the clubId path param, so a future table edit cannot silently
// make them public. This is the route-policy half of the P9 security requirement
// (docs/coc-mapping/05 §10).
func TestPreseasonRoutesAreOwnerScoped(t *testing.T) {
	for _, id := range []string{"preseason.get", "preseason.play", "preseason.claim"} {
		rule, ok := Table[id]
		if !ok {
			t.Fatalf("%s is not in the policy table", id)
		}
		if rule.Kind != Club || rule.Source != SourceParam || rule.Field != "clubId" {
			t.Fatalf("%s rule = %+v, want Club/param/clubId", id, rule)
		}
	}
}
