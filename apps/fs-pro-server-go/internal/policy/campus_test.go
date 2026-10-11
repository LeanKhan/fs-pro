package policy

import "testing"

// TestCampusPerkRouteIsOwnerScoped pins the Board-Perks consume route as a Club
// rule on the clubId path param, so a future table edit cannot silently make a
// currency-granting mutation public (04 §7, §10).
func TestCampusPerkRouteIsOwnerScoped(t *testing.T) {
	for _, id := range []string{
		"campus.get", "campus.upgrade", "campus.place", "campus.collect",
		"campus.clearObstacle", "campus.buyGroundskeeper", "campus.usePerk",
	} {
		rule, ok := Table[id]
		if !ok {
			t.Fatalf("%s is not in the policy table", id)
		}
		if rule.Kind != Club || rule.Source != SourceParam || rule.Field != "clubId" {
			t.Fatalf("%s rule = %+v, want Club/param/clubId", id, rule)
		}
	}
}
