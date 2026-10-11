package program

import (
	"context"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/db"
)

// GetTip ports owner-program.service.ts getTip: re-derive the club's StepFacts,
// merge the owner's advisor memory, and forward to the world-service tip engine.
func (r *Repository) GetTip(ctx context.Context, clubID string, advisor map[string]any, now int64, events map[string]any) (any, error) {
	program, err := r.Program(ctx, clubID)
	if err != nil {
		return nil, err
	}
	active := resolveActiveStep(db.StringField(program, "Step"))
	if active == "" {
		return nil, nil
	}
	facts, err := r.BuildStepFacts(ctx, clubID, active, events)
	if err != nil {
		return nil, err
	}
	dismissed := uniqueStrings(append(stringList(program["DismissedTips"]), stringList(advisor["dismissed"])...))
	shows := any(advisor["shows"])
	if shows == nil {
		shows = map[string]any{}
	}
	lastShownAt := any(advisor["lastShownAt"])
	if lastShownAt == nil {
		lastShownAt = map[string]any{}
	}
	quiet, _ := advisor["quiet"].(bool)

	response, err := clients.ProgramTip(ctx, map[string]any{
		"facts": facts,
		"advisor": map[string]any{
			"shows": shows, "lastShownAt": lastShownAt, "dismissed": dismissed, "quiet": quiet,
		},
		"now": float64(now),
	})
	if err != nil {
		return nil, err
	}
	return response["tip"], nil
}

func uniqueStrings(list []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range list {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
