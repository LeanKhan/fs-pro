package policy

import (
	"context"
	"fmt"
	"net/url"
)

// Ownership is the result of an ownership lookup.
type Ownership int

// Ownership values.
const (
	Missing Ownership = iota
	No
	Yes
)

// Access is the database surface the guard needs. auth.PgAccess implements it;
// tests inject a fake.
type Access interface {
	IsAdmin(ctx context.Context, userID string) (isAdmin, found bool, err error)
	OwnsClub(ctx context.Context, userID, clubID string) (Ownership, error)
	PlayerClub(ctx context.Context, playerID string) (clubID string, found bool, err error)
	FixtureTeams(ctx context.Context, fixtureID string) (home, away string, found bool, err error)
}

// Request is the guard's view of the incoming request.
type Request struct {
	Method string
	UserID string
	// Param resolves a route parameter, or "" when absent.
	Param func(name string) string
	Body  map[string]any
	Query url.Values
}

func (r Request) field(src Source, name string) any {
	switch src {
	case SourceBody:
		if r.Body == nil {
			return nil
		}
		return r.Body[name]
	case SourceQuery:
		if r.Query == nil {
			return nil
		}
		if v := r.Query.Get(name); v != "" {
			return v
		}
		return nil
	default:
		if r.Param == nil {
			return nil
		}
		if v := r.Param(name); v != "" {
			return v
		}
		return nil
	}
}

// Decision is the guard's verdict.
type Decision struct {
	Allowed bool
	Status  int
	Message string
	// Keep lists the body fields a non-admin may write; non-empty only for
	// allowed Self/Club/Player rules.
	Keep []string
}

// Enforce applies rule to req. It never returns an error: internal failures
// are logged by the caller and become the same 403 "Not allowed" Node emits.
func Enforce(ctx context.Context, rule Rule, req Request, access Access) Decision {
	if rule.Kind == Public {
		return Decision{Allowed: true}
	}
	if req.UserID == "" {
		return Decision{Status: 401, Message: "Not logged in"}
	}
	if rule.Kind == SignedIn || rule.Kind == Handler {
		// Handler routes check owner/admin access themselves, exactly like
		// Node's handlers; the guard still requires a signed-in user so an
		// anonymous caller can never reach one.
		return Decision{Allowed: true}
	}

	admin, found, err := access.IsAdmin(ctx, req.UserID)
	if err != nil {
		return notAllowed()
	}
	if !found {
		return Decision{Status: 401, Message: "Not logged in"}
	}
	// route-policy.ts: an admin is allowed on every rule kind, and no
	// keepFields filtering is applied for them.
	if admin {
		return Decision{Allowed: true}
	}
	if rule.Kind == Admin {
		return Decision{Status: 403, Message: "Admins only"}
	}

	switch rule.Kind {
	case Admin:
		return Decision{Allowed: true}
	case Self:
		if req.Param == nil || req.Param(rule.Param) != req.UserID {
			return Decision{Status: 403, Message: "That is not your account"}
		}
		return Decision{Allowed: true, Keep: rule.Fields}
	case Club:
		return enforceClub(ctx, req, rule, req.UserID, access)
	case Player:
		return enforcePlayer(ctx, req, rule, req.UserID, access)
	case Fixture:
		return enforceFixture(ctx, req, rule, req.UserID, access)
	default:
		return notAllowed()
	}
}

func enforceClub(ctx context.Context, req Request, rule Rule, userID string, access Access) Decision {
	clubID, _ := req.field(rule.Source, rule.Field).(string)
	if clubID == "" {
		return Decision{Status: 404, Message: "Club not found"}
	}
	owns, err := access.OwnsClub(ctx, userID, clubID)
	if err != nil {
		return notAllowed()
	}
	switch owns {
	case Missing:
		return Decision{Status: 404, Message: "Club not found"}
	case No:
		return Decision{Status: 403, Message: "You do not manage this club"}
	default:
		return Decision{Allowed: true, Keep: rule.Fields}
	}
}

func enforcePlayer(ctx context.Context, req Request, rule Rule, userID string, access Access) Decision {
	playerID := ""
	if req.Param != nil {
		playerID = req.Param(rule.Param)
	}
	clubID, found, err := access.PlayerClub(ctx, playerID)
	if err != nil {
		return notAllowed()
	}
	if !found {
		return Decision{Status: 404, Message: "Player not found"}
	}
	owns, err := access.OwnsClub(ctx, userID, clubID)
	if err != nil {
		return notAllowed()
	}
	if owns != Yes {
		return Decision{Status: 403, Message: "That player is not at your club"}
	}
	return Decision{Allowed: true, Keep: rule.Fields}
}

func enforceFixture(ctx context.Context, req Request, rule Rule, userID string, access Access) Decision {
	for _, flag := range rule.AdminQuery {
		v := req.field(SourceQuery, flag)
		if v == nil {
			continue
		}
		s, _ := v.(string)
		if s != "false" && s != "0" {
			return Decision{Status: 403, Message: fmt.Sprintf("%s is for admins only", flag)}
		}
	}
	fixtureID := ""
	if req.Param != nil {
		fixtureID = req.Param(rule.Param)
	}
	home, away, found, err := access.FixtureTeams(ctx, fixtureID)
	if err != nil {
		return notAllowed()
	}
	if !found {
		return Decision{Status: 404, Message: "Fixture not found"}
	}
	for _, clubID := range []string{home, away} {
		if clubID == "" {
			continue
		}
		if owns, oerr := access.OwnsClub(ctx, userID, clubID); oerr == nil && owns == Yes {
			return Decision{Allowed: true}
		}
	}
	return Decision{Status: 403, Message: "You are not playing in this match"}
}

func notAllowed() Decision { return Decision{Status: 403, Message: "Not allowed"} }

// KeepFields deletes every top-level body key not in fields. A rule with no
// fields keeps everything (matching route-policy.ts's keepFields).
func KeepFields(body map[string]any, fields []string) {
	if len(fields) == 0 || body == nil {
		return
	}
	allowed := make(map[string]struct{}, len(fields))
	for _, f := range fields {
		allowed[f] = struct{}{}
	}
	for k := range body {
		if _, ok := allowed[k]; !ok {
			delete(body, k)
		}
	}
}
