package manager

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"fs-pro-server/internal/club"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// Handlers implements the managers.* routes.
type Handlers struct {
	repo  *Repository
	clubs *club.Repository
}

// New builds the handler set.
func New(repo *Repository, clubs *club.Repository) *Handlers {
	return &Handlers{repo: repo, clubs: clubs}
}

func str(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return s
}

func body(cx *httpapi.Context) map[string]any {
	m, _ := cx.BodyMap()
	if m == nil {
		return map[string]any{}
	}
	return m
}

// getManagers is GET /api/managers.
func (h *Handlers) getManagers(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	filter := Filter{}
	if v, ok := boolQuery(q.Get("isEmployed")); ok {
		filter.IsEmployed, filter.HasIsEmployed = v, true
	}
	if v := q.Get("clubId"); v != "" {
		filter.ClubID, filter.HasClubID = v, true
	}
	managers, err := h.repo.FindAll(r.Context(), filter, ReadOptions{
		WithClub:        q.Get("populate") == "Club",
		WithNationality: true,
	})
	if err != nil {
		return httpapi.Fail(400, "Error fetching Managers", err.Error())
	}
	return httpapi.OK("Managers fetched successfully", managers)
}

// getUnemployedManagers is GET /api/managers/unemployed.
func (h *Handlers) getUnemployedManagers(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	managers, err := h.repo.FindAll(r.Context(), Filter{IsEmployed: false, HasIsEmployed: true},
		ReadOptions{WithClub: true, WithNationality: true})
	if err != nil {
		return httpapi.Fail(400, "Error fetching players", err.Error())
	}
	return httpapi.OK("Managers fetched successfully", managers)
}

// getManager is GET /api/managers/{id}.
func (h *Handlers) getManager(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	opts := ReadOptions{}
	if r.URL.Query().Get("populate") == "true" {
		opts.WithClub = true
	}
	manager, ok, err := h.repo.FindByID(r.Context(), r.PathValue("id"), opts)
	if err != nil {
		return httpapi.Fail(400, "Error fetching Manager", err.Error())
	}
	if !ok {
		return httpapi.OK("Manager fetched successfully", nil)
	}
	return httpapi.OK("Manager fetched successfully", manager)
}

// deleteManager is DELETE /api/managers/{id}.
func (h *Handlers) deleteManager(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	id := r.PathValue("id")
	manager, ok, err := h.repo.FindByID(ctx, id, ReadOptions{})
	if err != nil {
		return httpapi.Fail(400, "Error deleting Manager", err.Error())
	}
	if ok && asBool(manager["isEmployed"]) && str(manager, "ClubId") != "" {
		_, aerr := h.clubs.AppendRecord(ctx, str(manager, "ClubId"), map[string]any{"ManagerId": nil}, map[string]any{
			"type":    "hired",
			"title":   str(manager, "FirstName") + " " + str(manager, "LastName") + " just left the club and the system :/",
			"date":    time.Now(),
			"details": "Manager is no longer in the system",
		})
		if aerr != nil {
			return httpapi.Fail(400, "Error deleting Manager", aerr.Error())
		}
	}
	deleted, ok, err := h.repo.Delete(ctx, id)
	if err != nil {
		return httpapi.Fail(400, "Error deleting Manager", err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "Error deleting Manager", "Manager ["+id+"] does not exist")
	}
	return httpapi.OK("Manager deleted successfully", deleted)
}

// updateManager is PUT /api/managers/{id}.
func (h *Handlers) updateManager(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	updated, ok, err := h.repo.Update(r.Context(), r.PathValue("id"), body(cx))
	if err != nil {
		return httpapi.Fail(400, "Error updating Manager", err.Error())
	}
	if !ok {
		return httpapi.OK("Manager updated successfully", nil)
	}
	return httpapi.OK("Manager updated successfully", updated)
}

// createManager is POST /api/managers.
func (h *Handlers) createManager(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	data := db.CopyMap(body(cx))
	key, err := nextManagerKey(ctx, h.repo.q)
	if err != nil {
		return httpapi.Fail(400, "Error creating Manager", err.Error())
	}
	data["Key"] = key
	created, err := h.repo.Create(ctx, data)
	if err != nil {
		return httpapi.Fail(400, "Error creating Manager", err.Error())
	}
	return httpapi.OK("Manger created successfully", created)
}

// nextManagerKey mirrors getNextCounterId('manager'): "MG-000001".
func nextManagerKey(ctx context.Context, q db.Querier) (string, error) {
	var value int64
	if err := q.QueryRow(ctx, `SELECT nextval($1::regclass)`, "manager_counter_seq").Scan(&value); err != nil {
		return "", err
	}
	number := strconv.FormatInt(1000000+value, 10)
	return "MG-" + number[1:], nil
}

func boolQuery(v string) (bool, bool) {
	switch v {
	case "true":
		return true, true
	case "false":
		return false, true
	default:
		return false, false
	}
}

func asBool(v any) bool {
	b, _ := v.(bool)
	return b
}
