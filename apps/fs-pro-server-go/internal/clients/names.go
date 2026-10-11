package clients

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// Person names from services/worldgen (Node: services/worldgen/names.service.ts).
// worldgen is tried first; only when it is down does this fall back to a small
// local pool, and that fallback is logged once per process, never silently.

// WorldgenCultures are the worldgen culture ids (services/worldgen/names/data/cultures).
var WorldgenCultures = []string{"hunterlaan", "inga", "karsh", "kev", "kiyoto", "legardio", "pregge", "proland"}

// PersonName is a split first/last name.
type PersonName struct {
	First string
	Last  string
}

var fallbackFirst = []string{
	"Aiden", "Beckett", "Callum", "Dorian", "Elio", "Finnegan", "Gideon", "Hartley", "Idris", "Jasper",
	"Kellan", "Lior", "Marcus", "Nolan", "Oisin", "Percy", "Quinlan", "Reuben", "Silas", "Tobias",
}
var fallbackLast = []string{
	"Ashworth", "Blackwood", "Carrow", "Dunmore", "Ellery", "Fairweather", "Gantry", "Halloway", "Ivester",
	"Jorvik", "Kestrel", "Lockhart", "Marrow", "Norwick", "Osgood", "Pembrook", "Ravenscar", "Stonebridge",
}

var namesFallbackOnce sync.Once

// WorldgenURL is the names/faces service base URL.
func WorldgenURL() string {
	if u := strings.TrimSpace(os.Getenv("WORLDGEN_SERVICE_URL")); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "http://localhost:3004"
}

// SplitFullName splits worldgen's "first__last" (or a plain spaced name).
func SplitFullName(full string) PersonName {
	if i := strings.Index(full, "__"); i >= 0 {
		return PersonName{strings.TrimSpace(full[:i]), strings.TrimSpace(full[i+2:])}
	}
	parts := strings.Fields(full)
	if len(parts) == 0 {
		return PersonName{}
	}
	return PersonName{parts[0], strings.Join(parts[1:], " ")}
}

// PersonNames returns `count` names from one worldgen culture (a random known
// culture when empty). It always returns `count` names.
func PersonNames(ctx context.Context, count int, culture string) []PersonName {
	if count <= 0 {
		return nil
	}
	if culture == "" {
		culture = WorldgenCultures[rand.Intn(len(WorldgenCultures))]
	}
	out, err := worldgenNames(ctx, count, culture)
	if err != nil || len(out) == 0 {
		namesFallbackOnce.Do(func() {
			slog.Warn("worldgen names unavailable; using the local fallback pool", "err", err)
		})
		out = out[:0]
	}
	for len(out) < count {
		out = append(out, PersonName{fallbackFirst[rand.Intn(len(fallbackFirst))], fallbackLast[rand.Intn(len(fallbackLast))]})
	}
	return out[:count]
}

func worldgenNames(ctx context.Context, count int, culture string) ([]PersonName, error) {
	body, _ := json.Marshal(map[string]any{"count": count, "culture": culture, "returnParts": "f_l"})
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, WorldgenURL()+"/names/generate", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("worldgen /names/generate -> %d", resp.StatusCode)
	}
	var payload struct {
		Names []string `json:"names"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&payload); err != nil {
		return nil, err
	}
	out := make([]PersonName, 0, len(payload.Names))
	for _, n := range payload.Names {
		if p := SplitFullName(n); p.First != "" {
			out = append(out, p)
		}
	}
	return out, nil
}
