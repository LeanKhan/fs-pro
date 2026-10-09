package openplay

// Competition-definition defaults + a minimal validator (ports
// services/competitions/definition.ts's fill-then-validate contract).

// DefError is one validation problem.
type DefError struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}

// DefaultDefinition returns the fill-in defaults for a competition definition.
func DefaultDefinition() map[string]any {
	return map[string]any{
		"Type":       "league",
		"Prestige":   2,
		"Entry":      map[string]any{"mode": "open", "minClubs": 4, "maxClubs": nil},
		"Stages":     []any{},
		"Rewards":    map[string]any{},
		"Recurrence": nil,
	}
}

// ValidateDefinition merges input over the defaults and returns the filled
// definition plus any errors. ok is false when errors is non-empty.
func ValidateDefinition(input map[string]any) (definition map[string]any, errors []DefError, ok bool) {
	def := DefaultDefinition()
	for k, v := range input {
		def[k] = v
	}
	if name, _ := def["Name"].(string); name == "" {
		errors = append(errors, DefError{Path: "Name", Message: "Name is required"})
	}
	if stages, ok := def["Stages"].([]any); !ok || len(stages) == 0 {
		errors = append(errors, DefError{Path: "Stages", Message: "At least one stage is required"})
	}
	if p, ok := numOf(def["Prestige"]); ok && (p < 1 || p > 5) {
		errors = append(errors, DefError{Path: "Prestige", Message: "Prestige must be 1..5"})
	}
	if len(errors) > 0 {
		return nil, errors, false
	}
	return def, []DefError{}, true
}

func numOf(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case int32:
		return float64(n), true
	default:
		return 0, false
	}
}
