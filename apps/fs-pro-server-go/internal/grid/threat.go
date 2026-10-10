package grid

// The coarse scout read of a grid (docs/coc-mapping/03 §1.7): when a manager
// scouts an opponent they see the Home Grid plus a legible read of its intent -
// which width lanes it loads and how high it stands - never the exact player
// list. Deterministic and pure so the scout screen can be table-tested.

// LaneRead is the load on one width lane (a third of the pitch).
type LaneRead struct {
	Name    string  `json:"name"`    // "left" | "centre" | "right"
	Players int     `json:"players"` // outfield players in the lane
	Share   float64 `json:"share"`   // Players / outfield count, 0..1
}

// ThreatRead is a coarse, deterministic read of a defensive/attacking shape.
type ThreatRead struct {
	// Lanes is ordered strongest first, breaking ties left, centre, right.
	Lanes []LaneRead `json:"lanes"`
	// Occupancy is the outfield player count per column X0..X8 (len Width).
	Occupancy []int `json:"occupancy"`
	// Attacking is the outfield players in the final third (columns X6..X8).
	Attacking int `json:"attacking"`
	// HighLine reports whether the deepest outfield player stands at X3 or
	// beyond (a pushed-up block).
	HighLine bool `json:"highLine"`
}

// laneName maps a row to its width lane.
func laneName(row int) string {
	switch {
	case row <= 1:
		return "left"
	case row <= 4:
		return "centre"
	default:
		return "right"
	}
}

// ThreatReadOf computes the scout read of a grid. It is total: any grid (empty,
// oversized, off-pitch) yields a well-formed read and never panics.
func ThreatReadOf(g Grid) ThreatRead {
	out := ThreatRead{Occupancy: make([]int, Width)}
	counts := map[string]int{"left": 0, "centre": 0, "right": 0}
	outfield := 0
	deepest := -1
	for _, s := range g.Slots {
		if s.Position == GK {
			continue
		}
		outfield++
		counts[laneName(s.Row)]++
		if s.Col >= 0 && s.Col < Width {
			out.Occupancy[s.Col]++
		}
		if s.Col >= 6 {
			out.Attacking++
		}
		if s.Col > deepest {
			deepest = s.Col
		}
	}
	out.HighLine = deepest >= 3

	share := func(n int) float64 {
		if outfield == 0 {
			return 0
		}
		return float64(n) / float64(outfield)
	}
	lanes := []LaneRead{
		{Name: "left", Players: counts["left"], Share: share(counts["left"])},
		{Name: "centre", Players: counts["centre"], Share: share(counts["centre"])},
		{Name: "right", Players: counts["right"], Share: share(counts["right"])},
	}
	// Stable insertion sort, strongest first; ties keep left, centre, right.
	for i := 1; i < len(lanes); i++ {
		for j := i; j > 0 && lanes[j].Players > lanes[j-1].Players; j-- {
			lanes[j], lanes[j-1] = lanes[j-1], lanes[j]
		}
	}
	out.Lanes = lanes
	return out
}
