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

// TestUpgradeMinutesTimeCurve pins the 04 §3.2 exponential curve: minutes(L) =
// BaseMinutes · TimeGrowth^(L-1), not the legacy linear BaseMinutes·L (OW-P11).
func TestUpgradeMinutesTimeCurve(t *testing.T) {
	t.Setenv("GAME_TIME_SCALE", "")
	// Stadium Grounds: base 20, growth 2.0 => 20, 40, 80, 160, 320.
	want := []float64{0, 20, 40, 80, 160, 320}
	for level := 1; level <= MaxAssetLevel; level++ {
		if got := UpgradeMinutes(StadiumGrounds, level); got != want[level] {
			t.Errorf("stadium L%d minutes = %v, want %v", level, got, want[level])
		}
	}
	// Every asset carries an explicit super-linear growth (04 §3.2).
	for _, at := range AssetTypes {
		if def := AssetConfig[at]; def.TimeGrowth < 2 {
			t.Errorf("%s TimeGrowth = %v, want >= 2", at, def.TimeGrowth)
		}
	}
	// A curve is super-linear: L4 - L3 exceeds L2 - L1 (linear would be equal).
	if a, b, c := UpgradeMinutes(Stands, 2), UpgradeMinutes(Stands, 3), UpgradeMinutes(Stands, 4); c-b <= b-a {
		t.Errorf("stands curve not super-linear: %v, %v, %v", a, b, c)
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
