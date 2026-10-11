// Package clients holds small HTTP clients for the sibling Go services
// (world-service). Every call goes through here, never a raw http call at a
// call site, and the base URL comes from WORLD_SERVICE_URL.
package clients

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// DefaultWorldServiceURL is the service's local-dev default.
const DefaultWorldServiceURL = "http://localhost:3006"

// WorldServiceURL resolves WORLD_SERVICE_URL with a localhost fallback.
func WorldServiceURL() string {
	if v := os.Getenv("WORLD_SERVICE_URL"); v != "" {
		return v
	}
	return DefaultWorldServiceURL
}

// WorldServicePost posts to a world-service path and returns the JSON body. A
// non-2xx response errors with Node's exact label/message shape.
func WorldServicePost(ctx context.Context, label, path string, request map[string]any) (map[string]any, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, WorldServiceURL()+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 6 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("world-service %s failed (%d)", label, resp.StatusCode)
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// PlacementSpot requests the binding placement spot for a new club.
func PlacementSpot(ctx context.Context, clubID string, inviteToken string) (map[string]any, error) {
	return WorldServicePost(ctx, "POST /placement/spot", "/placement/spot", map[string]any{
		"clubId": clubID, "inviteToken": nullableString(inviteToken),
	})
}

func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// ProgramTip posts the tip request to the world-service engine and returns its
// JSON body. A non-2xx response errors with Node's exact label/message shape.
func ProgramTip(ctx context.Context, request map[string]any) (map[string]any, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, WorldServiceURL()+"/program/tip", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 6 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("world-service POST /program/tip failed (%d)", resp.StatusCode)
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}
