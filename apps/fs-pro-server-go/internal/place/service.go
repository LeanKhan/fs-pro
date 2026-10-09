package place

import (
	"context"
	"fmt"
	"time"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/db"
)

// WorldService ports services/worldPlaceService.ts.
type WorldService struct {
	repo  *Repository
	world clients.WorldReader
}

// NewWorldService wires the place repository to a world reader.
func NewWorldService(repo *Repository, world clients.WorldReader) *WorldService {
	return &WorldService{repo: repo, world: world}
}

// SyncSummary is the payload of POST /places/sync-from-world.
type SyncSummary struct {
	Offline bool     `json:"offline"`
	Checked int      `json:"checked"`
	Updated []string `json:"updated"`
	Stale   []string `json:"stale"`
	Errors  []string `json:"errors"`
}

// MissingCountry is a world country with no local row yet.
type MissingCountry struct {
	EntityID string `json:"entity_id"`
	Name     string `json:"name"`
}

// ResolvedAnchor is the payload of POST /places/resolve-anchor.
type ResolvedAnchor struct {
	Breadcrumbs    []string
	City           string
	HasCity        bool
	CountryID      string
	HasCountryID   bool
	MissingCountry *MissingCountry
}

func (s *WorldService) localCountries(ctx context.Context) ([]map[string]any, error) {
	return s.repo.FindAll(ctx, Filter{Type: "country", HasType: true})
}

// ImportCountryFromWorld adds or refreshes a local country row from the world.
func (s *WorldService) ImportCountryFromWorld(ctx context.Context, entityID string) (map[string]any, error) {
	result := s.world.GetCard(ctx, entityID)
	switch result.Status {
	case "offline":
		return nil, fmt.Errorf("the world server could not be reached. Try again later")
	case "missing":
		return nil, fmt.Errorf("that place does not exist in the world")
	}
	card := result.Card
	if card.Kind != "country" {
		return nil, fmt.Errorf("%q is a %s, not a country", card.Name, card.Kind)
	}
	code := stringOrEmpty(card.Code)
	if code == "" {
		return nil, fmt.Errorf("%q has no code in the world. Set its code in Imaginations first", card.Name)
	}

	countries, err := s.localCountries(ctx)
	if err != nil {
		return nil, err
	}
	var existing map[string]any
	for _, c := range countries {
		if db.StringField(c, "entity_id") == card.ID {
			existing = c
		}
		if db.StringField(c, "Code") == code && db.StringField(c, "entity_id") != card.ID {
			return nil, fmt.Errorf("code %s is already used by %s in FS-Pro", code, db.StringField(c, "Name"))
		}
	}

	snapshot := map[string]any{
		"Name":          card.Name,
		"Code":          code,
		"entity_id":     card.ID,
		"WorldRevision": card.Revision,
		"WorldSyncedAt": time.Now(),
		"WorldStale":    false,
	}
	if existing != nil {
		updated, _, uerr := s.repo.Update(ctx, db.StringField(existing, "_id"), snapshot)
		return updated, uerr
	}
	snapshot["Fullname"] = card.Name
	snapshot["Region"] = ""
	snapshot["Type"] = "country"
	return s.repo.Create(ctx, snapshot)
}

// SyncFromWorld refreshes every world-linked country row whose revision moved.
func (s *WorldService) SyncFromWorld(ctx context.Context) (SyncSummary, error) {
	summary := SyncSummary{Updated: []string{}, Stale: []string{}, Errors: []string{}}
	all, err := s.localCountries(ctx)
	if err != nil {
		return summary, err
	}
	linked := make([]map[string]any, 0, len(all))
	for _, c := range all {
		if db.StringField(c, "entity_id") != "" {
			linked = append(linked, c)
		}
	}
	summary.Checked = len(linked)
	if len(linked) == 0 {
		return summary, nil
	}
	ids := make([]string, len(linked))
	for i, c := range linked {
		ids[i] = db.StringField(c, "entity_id")
	}
	cards, offline := s.world.GetCards(ctx, ids)
	if offline {
		summary.Offline = true
		return summary, nil
	}

	for _, place := range linked {
		entityID := db.StringField(place, "entity_id")
		card, ok := cards[entityID]
		if !ok {
			if !asBool(place["WorldStale"]) {
				if _, _, uerr := s.repo.Update(ctx, db.StringField(place, "_id"), map[string]any{"WorldStale": true}); uerr != nil {
					summary.Errors = append(summary.Errors, db.StringField(place, "Name")+": "+uerr.Error())
					continue
				}
			}
			summary.Stale = append(summary.Stale, db.StringField(place, "Name"))
			continue
		}
		stale := asBool(place["WorldStale"])
		rev := intOf(place["WorldRevision"])
		if !stale && rev != 0 && card.Revision <= int64(rev) {
			continue
		}
		changes := map[string]any{
			"Name":          card.Name,
			"WorldRevision": card.Revision,
			"WorldSyncedAt": time.Now(),
			"WorldStale":    false,
		}
		if db.StringField(place, "Fullname") == db.StringField(place, "Name") {
			changes["Fullname"] = card.Name
		}
		if code := stringOrEmpty(card.Code); code != "" {
			changes["Code"] = code
		}
		if _, _, uerr := s.repo.Update(ctx, db.StringField(place, "_id"), changes); uerr != nil {
			summary.Errors = append(summary.Errors, db.StringField(place, "Name")+": "+uerr.Error())
			continue
		}
		summary.Updated = append(summary.Updated, card.Name)
	}
	return summary, nil
}

// ResolveAnchor derives a country and city from an anchor place.
func (s *WorldService) ResolveAnchor(ctx context.Context, entityID string) (*ResolvedAnchor, error) {
	result := s.world.GetCard(ctx, entityID)
	if result.Status != "ok" {
		return nil, nil
	}
	card := result.Card
	chain := append([]clients.Ancestor{}, card.Ancestors...)
	chain = append(chain, clients.Ancestor{ID: card.ID, Name: card.Name, Kind: card.Kind, Code: card.Code})

	nearest := func(kind string) *clients.Ancestor {
		for i := len(chain) - 1; i >= 0; i-- {
			if chain[i].Kind == kind {
				return &chain[i]
			}
		}
		return nil
	}

	out := &ResolvedAnchor{Breadcrumbs: card.Breadcrumbs}
	if city := nearest("city"); city != nil {
		out.City, out.HasCity = city.Name, true
	}
	if country := nearest("country"); country != nil {
		countries, err := s.localCountries(ctx)
		if err != nil {
			return nil, err
		}
		var local map[string]any
		for _, c := range countries {
			if db.StringField(c, "entity_id") == country.ID {
				local = c
				break
			}
		}
		if local != nil {
			out.CountryID, out.HasCountryID = db.StringField(local, "_id"), true
		} else {
			out.MissingCountry = &MissingCountry{EntityID: country.ID, Name: country.Name}
		}
	}
	return out, nil
}

func asBool(v any) bool {
	b, _ := v.(bool)
	return b
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int8:
		return int(n)
	case int16:
		return int(n)
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float32:
		return int(n)
	case float64:
		return int(n)
	default:
		return 0
	}
}
