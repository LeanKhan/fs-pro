package openplay

import "testing"

func TestValidateDefinitionDefaults(t *testing.T) {
	def, errs, ok := ValidateDefinition(map[string]any{
		"Name":   "World Cup",
		"Stages": []any{map[string]any{"type": "league"}},
	})
	if !ok || len(errs) != 0 {
		t.Fatalf("valid definition rejected: %v", errs)
	}
	if def["Type"] != "league" || def["Prestige"] != 2 {
		t.Fatalf("defaults not applied: %v", def)
	}
}

func TestValidateDefinitionErrors(t *testing.T) {
	_, errs, ok := ValidateDefinition(map[string]any{"Stages": []any{}})
	if ok || len(errs) < 2 {
		t.Fatalf("expected Name + Stages errors, got %v (ok=%v)", errs, ok)
	}
	_, errs, ok = ValidateDefinition(map[string]any{
		"Name":     "X",
		"Stages":   []any{map[string]any{"type": "league"}},
		"Prestige": 9,
	})
	if ok || len(errs) != 1 || errs[0].Path != "Prestige" {
		t.Fatalf("prestige range not enforced: %v (ok=%v)", errs, ok)
	}
}
