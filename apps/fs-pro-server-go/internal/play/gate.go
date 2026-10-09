package play

// PLAY gate (squad-gate.ts): a club cannot play until it has a manager and a
// legal matchday squad (11 signed, non-retired players incl. one keeper).

// Gate limits.
const (
	MinSquadSize   = 11
	MinGoalkeepers = 1
)

// GateRefusal is a typed, client-consumable refusal.
type GateRefusal struct {
	Code    string
	Message string
}

// GateProblem returns the refusal for a manager id + squad counts, or nil when
// the club may play. Pure so the rule is table-testable.
func GateProblem(managerID string, total, gk int) *GateRefusal {
	if managerID == "" {
		return &GateRefusal{Code: "no_manager",
			Message: "Sign a manager before your first match - the owner sets the brief, the manager runs it"}
	}
	if gk < MinGoalkeepers {
		return &GateRefusal{Code: "no_keeper", Message: "No keeper, no match. Sign a goalkeeper to open the gate"}
	}
	if total < MinSquadSize {
		return &GateRefusal{Code: "no_squad",
			Message: "A matchday squad needs at least 11 players - you have " + itoa(total)}
	}
	return nil
}
