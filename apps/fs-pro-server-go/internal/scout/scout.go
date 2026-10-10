// Package scout is the player-scouting core (docs/coc-mapping/02 §B2): scouting a
// target reveals only masked rating/attribute bands, widening with the Scouting
// facility level and the Scout Tokens spent. Pure and table-testable.
package scout

// Band is an inclusive rating range revealed by a scout report.
type Band struct {
	Low  int
	High int
}

// HiddenSpread is the half-width of the mask at scouting level 0: a scout sees
// the true rating +/- 15.
const HiddenSpread = 15

// Mask hides a true rating inside a band. Each scouting level narrows the spread
// by 2 (min 3), so a better Scouting facility reveals a truer picture.
func Mask(rating, scoutingLevel int) Band {
	spread := HiddenSpread - 2*scoutingLevel
	if spread < 3 {
		spread = 3
	}
	return Band{Low: rating - spread, High: rating + spread}
}

// Reveals reports whether a scouted band contains the true rating (so a report
// never lies about the ballpark).
func Reveals(b Band, rating int) bool {
	return rating >= b.Low && rating <= b.High
}

// Cost is the Scout Token cost of a deep report, falling as the Scouting
// facility improves. A base report is free.
func Cost(base int, scoutingLevel int) int {
	c := base - 10*scoutingLevel
	if c < 0 {
		return 0
	}
	return c
}
