// Package clients holds outbound HTTP clients to sibling services. The first
// is the Imaginations world reader used by the places import/sync/resolve
// flows (mirrors apps/fs-pro-server/src/services/worldClient.ts).
package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// EntityCard is the universal entity card returned by the world.
type EntityCard struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	Kind        string     `json:"kind"`
	Code        *string    `json:"code"`
	Breadcrumbs []string   `json:"breadcrumbs"`
	Ancestors   []Ancestor `json:"ancestors"`
	Summary     string     `json:"summary"`
	URL         string     `json:"url"`
	Revision    int64      `json:"revision"`
	UpdatedAt   string     `json:"updatedAt"`
}

// Ancestor is one place on the way to a country.
type Ancestor struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	Kind string  `json:"kind"`
	Code *string `json:"code"`
}

// CardResult is the getCard outcome. Offline means the world was unreachable.
type CardResult struct {
	Status  string // "ok" | "missing" | "offline"
	Card    EntityCard
	HasCard bool
}

// WorldReader is the read surface the places service needs.
type WorldReader interface {
	CanRead() bool
	GetCard(ctx context.Context, entityID string) CardResult
	GetCards(ctx context.Context, entityIDs []string) (map[string]EntityCard, bool)
}

const readTimeout = 3 * time.Second

// WorldClient talks to the world's public entity API.
type WorldClient struct {
	apiURL string
	client *http.Client
}

// NewWorldClient builds a client from IMAGINATION_API_URL ("" = unconfigured).
func NewWorldClient(apiURL string) *WorldClient {
	return &WorldClient{apiURL: strings.TrimRight(apiURL, "/"), client: &http.Client{Timeout: readTimeout}}
}

// CanRead reports whether an API url is configured.
func (c *WorldClient) CanRead() bool { return c.apiURL != "" }

// GetCard fetches one entity card.
func (c *WorldClient) GetCard(ctx context.Context, entityID string) CardResult {
	if !c.CanRead() {
		return CardResult{Status: "offline"}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.apiURL+"/api/entity/"+url.PathEscape(entityID), nil)
	if err != nil {
		return CardResult{Status: "offline"}
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return CardResult{Status: "offline"}
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return CardResult{Status: "missing"}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return CardResult{Status: "offline"}
	}
	var card EntityCard
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&card); err != nil {
		return CardResult{Status: "offline"}
	}
	return CardResult{Status: "ok", Card: card, HasCard: true}
}

// GetCards batches a lookup; unknown ids are simply absent and offline is true
// when the world was unreachable.
func (c *WorldClient) GetCards(ctx context.Context, entityIDs []string) (map[string]EntityCard, bool) {
	out := map[string]EntityCard{}
	if !c.CanRead() {
		return out, true
	}
	for i := 0; i < len(entityIDs); i += 100 {
		end := i + 100
		if end > len(entityIDs) {
			end = len(entityIDs)
		}
		chunk := entityIDs[i:end]
		escaped := make([]string, len(chunk))
		for j, id := range chunk {
			escaped[j] = url.QueryEscape(id)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.apiURL+"/api/entity?ids="+strings.Join(escaped, ","), nil)
		if err != nil {
			return out, true
		}
		resp, err := c.client.Do(req)
		if err != nil {
			return out, true
		}
		var cards []EntityCard
		derr := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&cards)
		resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return out, true
		}
		if derr != nil {
			return out, true
		}
		for _, card := range cards {
			out[card.ID] = card
		}
	}
	return out, false
}

// ErrOffline is returned by helpers when the world cannot be reached.
var ErrOffline = fmt.Errorf("the world server could not be reached")
