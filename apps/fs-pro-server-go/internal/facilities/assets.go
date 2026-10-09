// Package facilities ports the club-facilities ("build your club") loop:
// asset levels/costs/effects (asset-config.ts), campus placement validation
// (campus-grid.ts) and the campus/upgrade repository.
package facilities

import (
	"math"
	"os"
	"strconv"
	"strings"
	"time"
)

// AssetType is one buildable facility.
type AssetType string

// Asset types, in ASSET_TYPES order.
const (
	StadiumGrounds AssetType = "stadium_grounds"
	Stands         AssetType = "stands"
	TrainingGround AssetType = "training_ground"
	YouthAcademy   AssetType = "youth_academy"
	Scouting       AssetType = "scouting"
	MedicalCentre  AssetType = "medical_centre"
	StaffHouse     AssetType = "staff_house"
)

// AssetTypes preserves the canonical order.
var AssetTypes = []AssetType{StadiumGrounds, Stands, TrainingGround, YouthAcademy, Scouting, MedicalCentre, StaffHouse}

// MaxAssetLevel / MaxConcurrentUpgrades mirror asset-config.ts.
const (
	MaxAssetLevel         = 5
	MaxConcurrentUpgrades = 1
)

// Requirement is another asset that must be at (target - levelOffset).
type Requirement struct {
	Type        AssetType
	LevelOffset int
}

// AssetDef is one asset's definition.
type AssetDef struct {
	Type        AssetType
	Name        string
	Description string
	BaseCost    float64
	CostGrowth  float64
	BaseMinutes float64
	Requires    []Requirement
}

var capacityByLevel = []int{1000, 3000, 8000, 18000, 32000, 55000}

// AssetConfig is the literal port of ASSET_CONFIG.
var AssetConfig = map[AssetType]AssetDef{
	StadiumGrounds: {Type: StadiumGrounds, Name: "Stadium Grounds",
		Description: "Pitch quality and floodlights. Starts as a bare dirt turf.",
		BaseCost:    250000, CostGrowth: 2.4, BaseMinutes: 20},
	Stands: {Type: Stands, Name: "Stands",
		Description: "Seating capacity. More seats mean more matchday income.",
		BaseCost:    300000, CostGrowth: 2.5, BaseMinutes: 30,
		Requires: []Requirement{{StadiumGrounds, 1}}},
	TrainingGround: {Type: TrainingGround, Name: "Training Ground",
		Description: "Boosts player growth from training.",
		BaseCost:    200000, CostGrowth: 2.3, BaseMinutes: 20},
	YouthAcademy: {Type: YouthAcademy, Name: "Youth Academy",
		Description: "Improves the quality of the yearly youth intake.",
		BaseCost:    350000, CostGrowth: 2.4, BaseMinutes: 40,
		Requires: []Requirement{{TrainingGround, 1}}},
	Scouting: {Type: Scouting, Name: "Scouting Department",
		Description: "Finds transfer talent: a shortlist of recommended signings, refreshed as you upgrade.",
		BaseCost:    220000, CostGrowth: 2.3, BaseMinutes: 25},
	MedicalCentre: {Type: MedicalCentre, Name: "Medical Centre",
		Description: "Your squad recovers faster between matches with specialized treatment bays.",
		BaseCost:    260000, CostGrowth: 2.4, BaseMinutes: 25,
		Requires: []Requirement{{TrainingGround, 1}}},
	StaffHouse: {Type: StaffHouse, Name: "Staff House",
		Description: "Houses specialist coaches. Higher levels unlock tactical abilities (coming soon).",
		BaseCost:    300000, CostGrowth: 2.5, BaseMinutes: 35,
		Requires: []Requirement{{TrainingGround, 1}}},
}

// IsAssetType reports whether value names a buildable asset.
func IsAssetType(value string) bool {
	_, ok := AssetConfig[AssetType(value)]
	return ok
}

// UpgradeCost is the cash cost of targetLevel (1..MaxAssetLevel).
func UpgradeCost(t AssetType, targetLevel int) float64 {
	def := AssetConfig[t]
	return math.Round(def.BaseCost * math.Pow(def.CostGrowth, float64(targetLevel-1)))
}

// UpgradeMinutes is the real clock time to build targetLevel, scaled by
// GAME_TIME_SCALE (whole seconds).
func UpgradeMinutes(t AssetType, targetLevel int) float64 {
	minutes := AssetConfig[t].BaseMinutes * float64(targetLevel)
	raw := minutes / gameTimeScale() * 60
	return math.Round(raw) / 60
}

func gameTimeScale() float64 {
	if v := strings.TrimSpace(os.Getenv("GAME_TIME_SCALE")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0.01 {
			return f
		}
	}
	return 1
}

// EffectLabel is the human-readable effect at a level.
func EffectLabel(t AssetType, level int) string {
	name := AssetConfig[t].Name
	if t == Stands {
		return strconv.Itoa(capacityByLevel[min(level, len(capacityByLevel)-1)]) + " capacity"
	}
	switch t {
	case StadiumGrounds:
		labels := []string{"Dirt turf", "Patchy grass", "Maintained grass", "Pro pitch", "Floodlit pitch", "World-class pitch"}
		if level >= 0 && level < len(labels) {
			return labels[level]
		}
	case TrainingGround:
		return "+" + strconv.Itoa(level*8) + "% training growth"
	case YouthAcademy:
		return "Youth intake quality +" + strconv.Itoa(level*6) + "%"
	case Scouting:
		return strconv.Itoa(1+min(level, 4)) + " scouted transfer targets"
	case MedicalCentre:
		if level == 0 {
			return "1 Treatment Bay · Standard recovery"
		}
		return strconv.Itoa(1+level/2) + " Treatment Bays · -" + strconv.Itoa(level*8) + "% match fatigue · -" + strconv.Itoa(level*10) + "% rest cooldown"
	case StaffHouse:
		return "Coaching level " + strconv.Itoa(level)
	}
	return name + " level " + strconv.Itoa(level)
}

// Effects is the numeric effect map at a level.
func Effects(t AssetType, level int) map[string]float64 {
	switch t {
	case StadiumGrounds:
		return map[string]float64{"pitchQuality": float64(level)}
	case Stands:
		cap := 0
		if level >= 0 && level < len(capacityByLevel) {
			cap = capacityByLevel[level]
		}
		return map[string]float64{"capacity": float64(cap)}
	case TrainingGround:
		return map[string]float64{"trainingGrowthMultiplier": 1 + float64(level)*0.08}
	case YouthAcademy:
		return map[string]float64{"youthQualityBonus": float64(level) * 0.06}
	case Scouting:
		return map[string]float64{"scoutingReach": float64(1 + min(level, 4))}
	case MedicalCentre:
		return map[string]float64{
			"medicalLevel":            float64(level),
			"cooldownMultiplier":      1 - float64(level)*0.1,
			"fatigueReduction":        float64(level) * 0.08,
			"injuryRiskReduction":     float64(level) * 0.1,
			"injuryDurationReduction": float64(min(level, 3)),
			"treatmentBays":           float64(1 + level/2),
			"treatmentDiscount":       float64(level) * 0.08,
			"passiveRecoveryRate":     float64(10 + level*5),
		}
	case StaffHouse:
		return map[string]float64{"coachingLevel": float64(level)}
	}
	return map[string]float64{}
}

// UpgradeCompletion is the completeAt for an upgrade started now.
func upgradeCompleteAt(t AssetType, targetLevel int, start time.Time) time.Time {
	return start.Add(time.Duration(UpgradeMinutes(t, targetLevel) * float64(time.Minute)))
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
