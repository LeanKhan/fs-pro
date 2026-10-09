package club

import "testing"

func TestApplyClubRelations(t *testing.T) {
	clubs := []map[string]any{
		{"_id": "c1", "AddressCountryId": "p1", "ManagerId": "m1"},
		{"_id": "c2", "AddressCountryId": nil, "ManagerId": nil},
	}
	places := map[string]map[string]any{"p1": {"_id": "p1", "Name": "Bellea"}}
	players := map[string][]map[string]any{"c1": {{"_id": "pl1"}}}
	managers := map[string]map[string]any{"m1": {"_id": "m1", "FirstName": "Jo"}}

	applyClubRelations(clubs, places, players, managers)

	if clubs[0]["AddressCountry"] == nil {
		t.Fatal("c1 should have AddressCountry")
	}
	if _, ok := clubs[1]["AddressCountry"]; ok {
		t.Fatal("c2 has no FK and must omit AddressCountry")
	}
	if got, ok := clubs[0]["Players"].([]map[string]any); !ok || len(got) != 1 {
		t.Fatalf("c1 Players = %v", clubs[0]["Players"])
	}
	if got, ok := clubs[1]["Players"].([]map[string]any); !ok || got == nil {
		t.Fatalf("c2 Players must be an empty array, got %v", clubs[1]["Players"])
	}
	if clubs[0]["Manager"] == nil {
		t.Fatal("c1 should have Manager")
	}
	if _, ok := clubs[1]["Manager"]; ok {
		t.Fatal("c2 has no manager and must omit Manager")
	}
}

func TestApplyClubRelationsWithoutPlayers(t *testing.T) {
	clubs := []map[string]any{{"_id": "c1", "ManagerId": "m1"}}
	applyClubRelations(clubs, map[string]map[string]any{}, nil, nil)
	if _, ok := clubs[0]["Players"]; ok {
		t.Fatal("Players must not be injected when not requested")
	}
	if _, ok := clubs[0]["Manager"]; ok {
		t.Fatal("Manager must not be injected when not requested")
	}
}

func TestRatingUpdate(t *testing.T) {
	ratings := []positionRating{
		{position: "GK", avgRating: 70},
		{position: "DEF", avgRating: 60},
		{position: "MID", avgRating: 55},
		{position: "ATT", avgRating: 65},
	}
	data := ratingUpdate(ratings)
	if data["AttackingClass"] != 65+55.0/2 {
		t.Fatalf("AttackingClass = %v", data["AttackingClass"])
	}
	if data["DefensiveClass"] != 70+60.0/2 {
		t.Fatalf("DefensiveClass = %v", data["DefensiveClass"])
	}
	if data["Rating"] != (70.0+60+55+65)/4 {
		t.Fatalf("Rating = %v", data["Rating"])
	}
	if data["GK_Rating"] != 70.0 || data["ATT_Rating"] != 65.0 {
		t.Fatalf("per-position ratings = %v", data)
	}
}

func TestRatingUpdateEmpty(t *testing.T) {
	data := ratingUpdate(nil)
	if data["Rating"] != 0.0 || data["AttackingClass"] != 0.0 {
		t.Fatalf("empty ratings = %v", data)
	}
}
