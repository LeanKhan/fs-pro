package program

import "fmt"

// stepResult is the internal evaluation of one step before XP aggregation.
type stepResult struct {
	completed bool
	stars     Stars
	reasons   []string
}

// evaluateStep dispatches to the step's predicate and star clauses.
func evaluateStep(f StepFacts) stepResult {
	switch f.Step {
	case StepManager:
		return evalManager(f)
	case StepPlayers:
		return evalPlayers(f)
	case StepFacilities:
		return evalFacilities(f)
	case StepLevel1:
		return evalLevel1(f)
	default:
		return stepResult{reasons: []string{"unknown step " + string(f.Step)}}
	}
}

func evalManager(f StepFacts) stepResult {
	var r stepResult
	if f.Manager == nil {
		r.reasons = append(r.reasons, "no manager signed")
		return r
	}
	if f.Manager.ContractYears <= 0 {
		r.reasons = append(r.reasons, fmt.Sprintf("manager has no contract (%d year(s))", f.Manager.ContractYears))
		return r
	}
	r.completed = true
	r.reasons = append(r.reasons, fmt.Sprintf("manager signed with %d contract year(s)", f.Manager.ContractYears))

	ovr := f.Manager.Overall
	feeCap := ManagerStepFeeRatio * f.StartingBalance
	overall55 := ovr >= 55
	overall60 := ovr >= 60
	feeOK := f.Manager.SigningFee <= feeCap
	cashOK := f.Budget >= ManagerCashFloor

	r.reasons = append(r.reasons,
		clause(overall55, "overall %d ≥ 55", "overall %d < 55", ovr),
		fmt.Sprintf("fee %.0f vs 40%% cap %.0f", f.Manager.SigningFee, feeCap),
		clause(cashOK, "budget %.0f ≥ 400000", "budget %.0f < 400000", f.Budget),
	)

	switch {
	case overall60 && feeOK && cashOK:
		r.stars = 3
	case overall55 || feeOK:
		r.stars = 2
	default:
		r.stars = 1
	}
	return r
}

func evalPlayers(f StepFacts) stepResult {
	var r stepResult
	s := f.Squad
	if s.Total < 11 {
		r.reasons = append(r.reasons, fmt.Sprintf("squad total %d < 11", s.Total))
	} else {
		r.reasons = append(r.reasons, fmt.Sprintf("squad total %d ≥ 11", s.Total))
	}
	if s.GK < 1 {
		r.reasons = append(r.reasons, fmt.Sprintf("goalkeepers %d < 1", s.GK))
	} else {
		r.reasons = append(r.reasons, fmt.Sprintf("goalkeepers %d ≥ 1", s.GK))
	}
	if s.Total < 11 || s.GK < 1 {
		return r
	}
	r.completed = true

	shapeOK := s.GK >= 2 && s.Def >= 4 && s.Mid >= 4 && s.Att >= 3
	if shapeOK {
		r.reasons = append(r.reasons, fmt.Sprintf("shape balanced (GK %d, DEF %d, MID %d, ATT %d)", s.GK, s.Def, s.Mid, s.Att))
	} else {
		r.reasons = append(r.reasons, fmt.Sprintf("shape thin (GK %d, DEF %d, MID %d, ATT %d; need ≥2/≥4/≥4/≥3)", s.GK, s.Def, s.Mid, s.Att))
	}
	ratingOK := s.MedianRating >= 55
	cashOK := f.Budget >= PlayersCashFloor
	r.reasons = append(r.reasons, clause(ratingOK, "median XI rating %.0f ≥ 55", "median XI rating %.0f < 55", s.MedianRating))
	r.reasons = append(r.reasons, clause(cashOK, "budget %.0f ≥ 100000", "budget %.0f < 100000", f.Budget))

	switch {
	case shapeOK && ratingOK && cashOK:
		r.stars = 3
	case shapeOK:
		r.stars = 2
	default:
		r.stars = 1
	}
	return r
}

// completedAssets returns the assets with a finished Tier ≥ 1.
func completedAssets(f StepFacts) []AssetFacts {
	var out []AssetFacts
	for _, a := range f.Assets {
		if a.Tier >= 1 && a.UpgradingTo == nil {
			out = append(out, a)
		}
	}
	return out
}

func evalFacilities(f StepFacts) stepResult {
	var r stepResult
	done := completedAssets(f)
	if len(done) == 0 {
		r.reasons = append(r.reasons, "no completed Tier ≥ 1 facility")
		return r
	}
	r.completed = true
	r.reasons = append(r.reasons, fmt.Sprintf("%d completed facility tier(s) ≥ 1", len(done)))

	// ★2: one of the three compounding Tier-1s.
	target := ""
	for _, a := range done {
		switch a.Type {
		case "training_ground", "stands", "medical_centre":
			if target == "" {
				target = a.Type
			}
		}
	}
	choiceOK := target != ""
	if choiceOK {
		r.reasons = append(r.reasons, fmt.Sprintf("Tier-1 %s is a compounding choice", target))
	} else {
		r.reasons = append(r.reasons, "no Tier-1 from {training_ground, stands, medical_centre}")
	}
	cashOK := f.Budget >= FacilitiesCashFloor
	effectOK := false
	for _, a := range done {
		if a.HasEffect {
			effectOK = true
			break
		}
	}
	r.reasons = append(r.reasons, clause(cashOK, "budget %.0f ≥ 200000", "budget %.0f < 200000", f.Budget))
	r.reasons = append(r.reasons, clause(effectOK, "facility has a non-zero effect", "facility effect is zero"))

	switch {
	case choiceOK && cashOK && effectOK:
		r.stars = 3
	case choiceOK:
		r.stars = 2
	default:
		r.stars = 1
	}
	return r
}

func evalLevel1(f StepFacts) stepResult {
	var r stepResult
	if f.ClubXp < Level1Xp {
		r.reasons = append(r.reasons, fmt.Sprintf("club XP %d < %d", f.ClubXp, Level1Xp))
		return r
	}
	r.completed = true
	r.reasons = append(r.reasons, fmt.Sprintf("club XP %d ≥ %d (Level 1)", f.ClubXp, Level1Xp))

	avgOK := f.ProgramXp >= 27
	fullOK := f.ProgramXp >= ProgramXpCap
	winsOK := f.Friendlies.Wins >= 2
	r.reasons = append(r.reasons, clause(avgOK, "program XP %d ≥ 27 (average ≥ 2★)", "program XP %d < 27", f.ProgramXp))
	r.reasons = append(r.reasons, clause(fullOK, "program XP %d ≥ 54 (3★ on every step)", "program XP %d < 54", f.ProgramXp))
	r.reasons = append(r.reasons, clause(winsOK, "%d qualifying friendly win(s) ≥ 2", "%d qualifying friendly win(s) < 2", f.Friendlies.Wins))

	switch {
	case fullOK && winsOK:
		r.stars = 3
	case avgOK:
		r.stars = 2
	default:
		r.stars = 1
	}
	return r
}

// clause renders one reason line, choosing the affirmative or negative form.
func clause(ok bool, yes, no string, args ...any) string {
	if ok {
		if yes == "" {
			return ""
		}
		return fmt.Sprintf(yes, args...)
	}
	return fmt.Sprintf(no, args...)
}
