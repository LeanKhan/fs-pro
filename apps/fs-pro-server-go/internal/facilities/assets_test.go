package facilities

import "testing"

func TestUpgradeCostAndLevels(t *testing.T) {
	// Level 1 = baseCost; later levels scale by costGrowth.
	if got := UpgradeCost(StadiumGrounds, 1); got != 250000 {
		t.Fatalf("stadium L1 = %v", got)
	}
	if got := UpgradeCost(StadiumGrounds, 2); got != 600000 {
		t.Fatalf("stadium L2 = %v", got)
	}
	if got := UpgradeCost(Stands, 1); got != 300000 {
		t.Fatalf("stands L1 = %v", got)
	}
	if MaxAssetLevel != 5 {
		t.Fatalf("MaxAssetLevel = %d", MaxAssetLevel)
	}
}

func TestUpgradeMinutesScalesWithLevel(t *testing.T) {
	t.Setenv("GAME_TIME_SCALE", "")
	if got := UpgradeMinutes(StadiumGrounds, 2); got != 40 {
		t.Fatalf("stadium L2 minutes = %v, want 40", got)
	}
	t.Setenv("GAME_TIME_SCALE", "2")
	if got := UpgradeMinutes(StadiumGrounds, 2); got != 20 {
		t.Fatalf("stadium L2 minutes at scale 2 = %v, want 20", got)
	}
}

func TestEffectsAndLabels(t *testing.T) {
	if Effects(Stands, 0)["capacity"] != 1000 {
		t.Fatalf("stands L0 capacity = %v", Effects(Stands, 0)["capacity"])
	}
	if Effects(MedicalCentre, 4)["treatmentBays"] != 3 {
		t.Fatalf("medical L4 bays = %v", Effects(MedicalCentre, 4)["treatmentBays"])
	}
	if EffectLabel(TrainingGround, 3) != "+24% training growth" {
		t.Fatalf("training label = %q", EffectLabel(TrainingGround, 3))
	}
}

func TestIsAssetType(t *testing.T) {
	if !IsAssetType("medical_centre") || IsAssetType("nope") {
		t.Fatal("IsAssetType failed")
	}
}
