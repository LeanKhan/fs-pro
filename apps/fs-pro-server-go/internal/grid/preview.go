package grid

// Advisory read of a layout: defensive auras, the passing-link graph, a
// connectivity verdict, a suggested team directness, and the proximity synergies
// that form. This mirrors the client preview (docs/coc-mapping/03 §1.4-1.6);
// validity stays with Validate (the server is authoritative).

// LinkRange is the Chebyshev cell distance within which two players are linked.
const LinkRange = 2

// Link is an undirected pair of linked players, by PlayerID. JSON keys are
// pinned to the wire contract style (lowercase) so the preview is a stable
// payload.
type Link struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// Preview is the advisory read of a grid.
type Preview struct {
	Aura       []float64 `json:"aura"`       // len Width*Height, row-major (row*Width + col)
	Links      []Link    `json:"links"`      //
	Connected  bool      `json:"connected"`  //
	Directness float64   `json:"directness"` // suggested team directness, 0..1 (higher = longer/more direct)
	Synergies  []string  `json:"synergies"`  // stable ids: one-two-combo, the-shield, island
}

func cheb(a, b Slot) int {
	dx, dy := a.Col-b.Col, a.Row-b.Row
	if dx < 0 {
		dx = -dx
	}
	if dy < 0 {
		dy = -dy
	}
	if dy > dx {
		return dy
	}
	return dx
}

// BuildPreview computes the advisory read of a grid. It is pure and
// deterministic: the same grid always yields the same preview.
func BuildPreview(g Grid) Preview {
	p := Preview{Aura: make([]float64, Width*Height)}
	n := len(g.Slots)

	// Auras: every outfielder projects pressure onto its own cell (full) and its
	// 8 neighbours (half). Overlaps stack.
	for _, s := range g.Slots {
		if s.Position == GK {
			continue
		}
		for dr := -1; dr <= 1; dr++ {
			for dc := -1; dc <= 1; dc++ {
				col, row := s.Col+dc, s.Row+dr
				if col < 0 || col >= Width || row < 0 || row >= Height {
					continue
				}
				d := dc
				if d < 0 {
					d = -d
				}
				e := dr
				if e < 0 {
					e = -e
				}
				c := d
				if e > c {
					c = e
				}
				p.Aura[row*Width+col] += 1.0 / (1.0 + float64(c))
			}
		}
	}

	// Passing links + adjacency over all slots (keeper included).
	adj := make([][]int, n)
	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			if cheb(g.Slots[i], g.Slots[j]) <= LinkRange {
				p.Links = append(p.Links, Link{From: g.Slots[i].PlayerID, To: g.Slots[j].PlayerID})
				adj[i] = append(adj[i], j)
				adj[j] = append(adj[j], i)
			}
		}
	}

	// Connectivity from the keeper: a squad with no connector in the middle has a
	// broken graph (the "long ball only" state).
	keeperIdx := -1
	for i := range g.Slots {
		if g.Slots[i].Position == GK {
			keeperIdx = i
			break
		}
	}
	reachable := 0
	if keeperIdx >= 0 && n > 0 {
		seen := make([]bool, n)
		queue := []int{keeperIdx}
		seen[keeperIdx] = true
		for len(queue) > 0 {
			cur := queue[0]
			queue = queue[1:]
			reachable++
			for _, nx := range adj[cur] {
				if !seen[nx] {
					seen[nx] = true
					queue = append(queue, nx)
				}
			}
		}
	}
	p.Connected = n > 0 && reachable == n
	fraction := 0.0
	if n > 0 {
		fraction = float64(reachable) / float64(n)
	}
	p.Directness = 0.3 + 0.5*(1.0-fraction)

	// Synergies (fixed order).
	p.Synergies = synergies(g)
	return p
}

func synergies(g Grid) []string {
	out := []string{}
	if anyPair(g, ATT, false, 1) {
		out = append(out, "one-two-combo")
	}
	if anyPair(g, MID, true, 1) {
		out = append(out, "the-shield")
	}
	if attackerIsland(g) {
		out = append(out, "island")
	}
	return out
}

// anyPair reports whether two slots of `pos` sit within `within` cells; when
// `central` is set, both must be in the central lanes (rows 2..4).
func anyPair(g Grid, pos Position, central bool, within int) bool {
	for i := 0; i < len(g.Slots); i++ {
		a := g.Slots[i]
		if a.Position != pos || (central && (a.Row < 2 || a.Row > 4)) {
			continue
		}
		for j := i + 1; j < len(g.Slots); j++ {
			b := g.Slots[j]
			if b.Position != pos || (central && (b.Row < 2 || b.Row > 4)) {
				continue
			}
			if cheb(a, b) <= within {
				return true
			}
		}
	}
	return false
}

// attackerIsland reports whether an attacker is marooned (>=3 cells from every
// teammate) - a lone target man.
func attackerIsland(g Grid) bool {
	for i := 0; i < len(g.Slots); i++ {
		a := g.Slots[i]
		if a.Position != ATT {
			continue
		}
		nearest := 1 << 30
		for j := 0; j < len(g.Slots); j++ {
			if i == j {
				continue
			}
			if d := cheb(a, g.Slots[j]); d < nearest {
				nearest = d
			}
		}
		if nearest >= 3 {
			return true
		}
	}
	return false
}
