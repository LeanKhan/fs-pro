package club

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"

	"fs-pro-server/internal/db"
)

func containsStr(haystack, needle string) bool { return strings.Contains(haystack, needle) }

// Lineup suggestion, ported from services/ai/lineup-advisor.service.ts using
// JevService's local fallback for the lineupApproach question.

// LineupSlot is one formation slot.
type LineupSlot struct {
	Label string
	Pos   string
}

type advisorPlayer struct {
	id       string
	name     string
	position string
	rating   float64
	fitness  float64
	attrs    map[string]any
}

var outOfPositionPenalty = map[string]float64{
	"DEF>MID": 12, "MID>DEF": 14, "MID>ATT": 12, "ATT>MID": 12, "DEF>ATT": 30, "ATT>DEF": 30,
}

const gkMismatchPenalty = 80
const benchSize = 7

var attackAttrs = []string{"Shooting", "Positioning", "Speed", "Dribbling"}
var defenceAttrs = []string{"Tackling", "Marking", "Interception", "Strength"}

func avgAttrs(p advisorPlayer, keys []string) float64 {
	sum, n := 0.0, 0
	for _, k := range keys {
		if v, ok := p.attrs[k]; ok {
			sum += jsonNumber(v)
			n++
		}
	}
	if n == 0 {
		return p.rating
	}
	return sum / float64(n)
}

func fit(p advisorPlayer, slot LineupSlot, approach string) float64 {
	base := p.rating
	if approach == "attacking" && (slot.Pos == "ATT" || slot.Pos == "MID") {
		base = base*0.5 + avgAttrs(p, attackAttrs)*0.5
	} else if approach == "solid" && (slot.Pos == "DEF" || slot.Pos == "MID") {
		base = base*0.5 + avgAttrs(p, defenceAttrs)*0.5
	}
	fitnessFactor := 0.9 + 0.1*math.Min(math.Max(p.fitness, 0), 100)/100
	penalty := 0.0
	if p.position != slot.Pos {
		if p.position == "GK" || slot.Pos == "GK" {
			penalty = gkMismatchPenalty
		} else if v, ok := outOfPositionPenalty[p.position+">"+slot.Pos]; ok {
			penalty = v
		} else {
			penalty = 20
		}
	}
	return base*fitnessFactor - penalty
}

func assign(pool []advisorPlayer, slots []LineupSlot, approach string) []*advisorPlayer {
	chosen := make([]*advisorPlayer, len(slots))
	used := map[string]bool{}

	order := make([]int, len(slots))
	for i := range slots {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool {
		sa, sb := slots[order[a]].Pos == "GK", slots[order[b]].Pos == "GK"
		if sa == sb {
			return false
		}
		return sa
	})

	for _, i := range order {
		var best *advisorPlayer
		bestScore := math.Inf(-1)
		for k := range pool {
			p := &pool[k]
			if used[p.id] {
				continue
			}
			v := fit(*p, slots[i], approach)
			if v > bestScore {
				bestScore = v
				best = p
			}
		}
		if best != nil {
			chosen[i] = best
			used[best.id] = true
		}
	}

	improved := true
	guard := 0
	for improved && guard < 50 {
		guard++
		improved = false
		for i := 0; i < len(slots); i++ {
			for j := i + 1; j < len(slots); j++ {
				a, b := chosen[i], chosen[j]
				if a == nil || b == nil {
					continue
				}
				before := fit(*a, slots[i], approach) + fit(*b, slots[j], approach)
				after := fit(*b, slots[i], approach) + fit(*a, slots[j], approach)
				if after > before+0.01 {
					chosen[i], chosen[j] = b, a
					improved = true
				}
			}
		}
		for i := 0; i < len(slots); i++ {
			a := chosen[i]
			if a == nil {
				continue
			}
			for k := range pool {
				p := &pool[k]
				inXI := false
				for _, c := range chosen {
					if c == p {
						inXI = true
					}
				}
				if inXI {
					continue
				}
				if fit(*p, slots[i], approach) > fit(*a, slots[i], approach)+0.01 {
					chosen[i] = p
					improved = true
					break
				}
			}
		}
	}
	return chosen
}

func pickBench(pool []advisorPlayer, starters map[string]bool) []string {
	remaining := []advisorPlayer{}
	for _, p := range pool {
		if !starters[p.id] {
			remaining = append(remaining, p)
		}
	}
	sort.SliceStable(remaining, func(a, b int) bool { return remaining[a].rating > remaining[b].rating })
	bench := []string{}
	benchSet := map[string]bool{}
	take := func(p *advisorPlayer) {
		if p != nil && len(bench) < benchSize && !benchSet[p.id] {
			bench = append(bench, p.id)
			benchSet[p.id] = true
		}
	}
	for _, pos := range []string{"GK", "DEF", "MID", "ATT"} {
		for k := range remaining {
			if remaining[k].position == pos {
				take(&remaining[k])
				break
			}
		}
	}
	for k := range remaining {
		take(&remaining[k])
	}
	return bench
}

type lineupCandidate struct {
	approach      string
	score         float64
	outOfPosition int
	avgRating     float64
	starters      []any
	bench         []string
}

func buildCandidate(pool []advisorPlayer, slots []LineupSlot, approach string) lineupCandidate {
	chosen := assign(pool, slots, approach)
	starters := []any{}
	score := 0.0
	oop := 0
	ratingSum := 0.0
	starterIDs := map[string]bool{}
	for i, p := range chosen {
		if p == nil {
			continue
		}
		out := p.position != slots[i].Pos
		if out {
			oop++
		}
		score += fit(*p, slots[i], "balanced")
		ratingSum += p.rating
		starterIDs[p.id] = true
		starters = append(starters, map[string]any{
			"slot": i, "label": slots[i].Label, "slotPos": slots[i].Pos,
			"playerId": p.id, "playerName": p.name, "naturalPos": p.position,
			"rating": math.Round(p.rating), "outOfPosition": out,
		})
	}
	avg := 0.0
	if len(starters) > 0 {
		avg = math.Round(ratingSum/float64(len(starters))*10) / 10
	}
	return lineupCandidate{
		approach: approach, score: math.Round(score*10) / 10, outOfPosition: oop,
		avgRating: avg, starters: starters, bench: pickBench(pool, starterIDs),
	}
}

var approachBlurb = map[string]string{
	"balanced":  "Best overall players in each slot by rating.",
	"attacking": "Favours shooting, positioning, pace and dribbling in attack and midfield.",
	"solid":     "Favours tackling, marking, interceptions and strength in defence and midfield.",
}

// SuggestLineup is POST /api/clubs/{id}/lineup-suggestion.
func (r *Repository) SuggestLineup(ctx context.Context, clubID, formation, style string, slots []LineupSlot) (map[string]any, error) {
	clubRows, err := r.q.Query(ctx, `SELECT "Name" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	if _, ok, err := db.ScanOne(clubRows); err != nil {
		return nil, err
	} else if !ok {
		return nil, fmt.Errorf("Club not found")
	}
	if len(slots) != 11 {
		return nil, fmt.Errorf("A formation needs exactly 11 slots")
	}
	playerRows, err := r.q.Query(ctx, `SELECT "_id","FirstName","LastName","Position","Rating","Fitness","Attributes","Injury"
		FROM "Players" WHERE "ClubId" = $1 AND "isRetired" = false`, clubID)
	if err != nil {
		return nil, err
	}
	rows, err := db.ScanAll(playerRows)
	if err != nil {
		return nil, err
	}
	all := make([]advisorPlayer, 0, len(rows))
	injured := make([]advisorPlayer, 0)
	pool := make([]advisorPlayer, 0, len(rows))
	for _, row := range rows {
		pos := db.StringField(row, "Position")
		if pos == "" {
			pos = "MID"
		}
		rating := 50.0
		if row["Rating"] != nil {
			rating = jsonNumber(row["Rating"])
		}
		fitness := 100.0
		if row["Fitness"] != nil {
			fitness = jsonNumber(row["Fitness"])
		}
		injury, _ := row["Injury"].(map[string]any)
		days := 0
		if injury != nil {
			days = intOf(injury["daysRemaining"])
		}
		p := advisorPlayer{
			id:       db.StringField(row, "_id"),
			name:     joinName(db.StringField(row, "FirstName"), db.StringField(row, "LastName")),
			position: pos, rating: rating, fitness: fitness,
			attrs: jsonMap(row["Attributes"]),
		}
		all = append(all, p)
		if days > 0 {
			injured = append(injured, p)
		} else {
			pool = append(pool, p)
		}
	}
	if len(pool) < 11 {
		return nil, fmt.Errorf("Only %d fit players available", len(pool))
	}

	approaches := []string{"balanced", "attacking", "solid"}
	candidates := make([]lineupCandidate, 0, 3)
	byApproach := map[string]lineupCandidate{}
	for _, a := range approaches {
		c := buildCandidate(pool, slots, a)
		candidates = append(candidates, c)
		byApproach[a] = c
	}

	approach, confidence := pickApproach(candidates, style)
	picked := byApproach[approach]
	oopNote := " Every starter is in his natural position."
	if picked.outOfPosition > 0 {
		verb := "players are"
		if picked.outOfPosition == 1 {
			verb = "player is"
		}
		oopNote = fmt.Sprintf(" %d %s out of position - the squad lacks natural players there.", picked.outOfPosition, verb)
	}
	candidateOut := make([]any, 0, 3)
	for _, c := range candidates {
		candidateOut = append(candidateOut, map[string]any{
			"approach": c.approach, "score": c.score, "outOfPosition": c.outOfPosition, "avgRating": c.avgRating,
		})
	}
	excluded := make([]any, 0, len(injured))
	for _, p := range injured {
		excluded = append(excluded, p.name)
	}
	return map[string]any{
		"approach":        approach,
		"source":          "local",
		"confidence":      confidence,
		"reasoning":       upperFirst(approach) + ": " + approachBlurb[approach] + oopNote,
		"starters":        picked.starters,
		"bench":           picked.bench,
		"candidates":      candidateOut,
		"excludedInjured": excluded,
	}, nil
}

// pickApproach ports JevService.fallbackEvaluate for the lineupApproach question.
func pickApproach(candidates []lineupCandidate, style string) (string, float64) {
	order := []string{"balanced", "attacking", "solid"}
	byName := map[string]lineupCandidate{}
	for _, c := range candidates {
		byName[c.approach] = c
	}
	styleLower := toLower(style)
	nudge := func(a string) float64 {
		n := 0.0
		if a == "attacking" && (containsStr(styleLower, "press") || containsStr(styleLower, "direct")) {
			n = 6
		}
		if a == "solid" && (containsStr(styleLower, "block") || containsStr(styleLower, "defen")) {
			n = 6
		}
		return n
	}
	type util struct {
		approach string
		u        float64
	}
	utilities := make([]util, 0, len(order))
	max := 0.0
	for _, a := range order {
		c, ok := byName[a]
		if !ok {
			continue
		}
		u := c.score - float64(c.outOfPosition)*8 + nudge(a)
		utilities = append(utilities, util{a, u})
		if u > max {
			max = u
		}
	}
	probs := map[string]float64{}
	total := 0.0
	for _, u := range utilities {
		e := math.Exp((u.u - max) / 12)
		probs[u.approach] = e
		total += e
	}
	if total == 0 {
		total = 1
	}
	best := order[0]
	maxProb := -1.0
	for _, a := range order {
		p := probs[a]
		if p == 0 {
			p = 1.0 / float64(len(order))
		}
		probs[a] = p / total
	}
	for _, a := range order {
		if probs[a] > maxProb {
			maxProb = probs[a]
			best = a
		}
	}
	return best, math.Round(maxProb*100) / 100
}

func jsonMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func jsonNumber(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

func joinName(a, b string) string {
	if a == "" {
		return b
	}
	if b == "" {
		return a
	}
	return a + " " + b
}

func upperFirst(s string) string {
	if s == "" {
		return s
	}
	return string(s[0]-32) + s[1:]
}

func toLower(s string) string {
	out := []byte(s)
	for i := range out {
		if out[i] >= 'A' && out[i] <= 'Z' {
			out[i] += 32
		}
	}
	return string(out)
}
