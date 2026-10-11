package award

import (
	"context"
	"net/http"

	"fs-pro-server/internal/club"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
	"fs-pro-server/internal/manager"
	"fs-pro-server/internal/player"
	"fs-pro-server/internal/season"
)

// Lookup resolves one object by id.
type Lookup func(ctx context.Context, id string) (map[string]any, bool, error)

// Handlers implements the awards.* route.
type Handlers struct {
	repo     *Repository
	players  *player.Repository
	managers *manager.Repository
	clubs    *club.Repository
	seasons  *season.Repository
}

// New builds the handler set.
func New(repo *Repository, players *player.Repository, managers *manager.Repository, clubs *club.Repository, seasons *season.Repository) *Handlers {
	return &Handlers{repo: repo, players: players, managers: managers, clubs: clubs, seasons: seasons}
}

// getSeasonAwards is GET /api/awards/season/{season_id}.
func (h *Handlers) getSeasonAwards(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	q := r.URL.Query()
	recipient := q.Get("recipient")
	populate := q.Get("populate")

	rows, err := h.repo.FindAll(ctx, r.PathValue("season_id"))
	if err != nil {
		return httpapi.Fail(400, "Error fetching Season Awards", err.Error())
	}
	if populate == "" {
		return httpapi.OK("Season Awards fetched successfully", rows)
	}

	recipientLookup := h.playerLookup
	if recipient == "manager" {
		recipientLookup = h.managerLookup
	}
	if err := attach(ctx, rows, "RecipientId", "Recipient", recipientLookup); err != nil {
		return httpapi.Fail(400, "Error fetching Season Awards", err.Error())
	}
	if populate == "club" || populate == "club-season" {
		if err := attach(ctx, rows, "ClubId", "Club", h.clubLookup); err != nil {
			return httpapi.Fail(400, "Error fetching Season Awards", err.Error())
		}
	}
	if populate == "club-season" {
		if err := attach(ctx, rows, "SeasonId", "Season", h.seasonLookup); err != nil {
			return httpapi.Fail(400, "Error fetching Season Awards", err.Error())
		}
	}
	return httpapi.OK("Season Awards fetched successfully", rows)
}

func (h *Handlers) playerLookup(ctx context.Context, id string) (map[string]any, bool, error) {
	return h.players.FindByID(ctx, id, false)
}

func (h *Handlers) managerLookup(ctx context.Context, id string) (map[string]any, bool, error) {
	return h.managers.FindByID(ctx, id, manager.ReadOptions{})
}

func (h *Handlers) clubLookup(ctx context.Context, id string) (map[string]any, bool, error) {
	return h.clubs.FindByID(ctx, id, club.ReadOptions{})
}

func (h *Handlers) seasonLookup(ctx context.Context, id string) (map[string]any, bool, error) {
	return h.seasons.FindByID(ctx, id)
}

// attach resolves each row's idField and sets targetField when it resolves,
// mirroring fetchAll's attachField.
func attach(ctx context.Context, rows []map[string]any, idField, targetField string, get Lookup) error {
	ids := db.CollectIDs(rows, idField)
	resolved := map[string]map[string]any{}
	for _, id := range ids {
		obj, ok, err := get(ctx, id)
		if err != nil {
			return err
		}
		if ok {
			resolved[id] = obj
		}
	}
	for _, row := range rows {
		if id := db.StringField(row, idField); id != "" {
			if obj := resolved[id]; obj != nil {
				row[targetField] = obj
			}
		}
	}
	return nil
}
