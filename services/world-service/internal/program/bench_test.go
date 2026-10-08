package program

import "testing"

func benchFacts(step Step) StepFacts {
	f := StepFacts{
		Step:            step,
		StartingBalance: 3_000_000,
		Budget:          1_200_000,
		Manager:         &ManagerFacts{Overall: 62, Tactics: 66, Motivation: 60, Development: 61, Discipline: 58, SigningFee: 360_000, Wage: 18_000, ContractYears: 3},
		Squad:           SquadFacts{Total: 16, GK: 2, Def: 5, Mid: 5, Att: 4, MedianRating: 56},
		Assets:          []AssetFacts{{Type: "training_ground", Tier: 1, HasEffect: true}},
		ProgramXp:       36,
		ClubXp:          60,
		Friendlies:      FriendlyFacts{Wins: 1, Draws: 0, Losses: 0},
	}
	return f
}

func BenchmarkEvaluate(b *testing.B) {
	steps := []Step{StepManager, StepPlayers, StepFacilities, StepLevel1}
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		for _, s := range steps {
			if _, err := Evaluate(ProgramEvaluateRequest{Step: s, Facts: benchFacts(s)}); err != nil {
				b.Fatal(err)
			}
		}
	}
}

func BenchmarkTip(b *testing.B) {
	f := benchFacts(StepPlayers)
	f.Squad.Total = 11
	f.Squad.GK = 0
	req := ProgramTipRequest{Facts: f, Now: 1_000_000}
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if _, err := Tip(req); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkSteps(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = Steps()
	}
}
