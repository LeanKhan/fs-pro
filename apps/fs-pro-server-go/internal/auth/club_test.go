package auth

import "testing"

func TestMergeAddressCountry(t *testing.T) {
	clubs := []map[string]any{
		{"_id": "c1", "AddressCountryId": "p1"},
		{"_id": "c2", "AddressCountryId": nil},
		{"_id": "c3", "AddressCountryId": "missing"},
	}
	places := []map[string]any{{"_id": "p1", "Name": "Bellea", "Code": "BL"}}
	mergeAddressCountry(clubs, places)

	if clubs[0]["AddressCountry"] == nil {
		t.Fatal("club with a resolvable FK must get AddressCountry")
	}
	if _, ok := clubs[1]["AddressCountry"]; ok {
		t.Fatal("null FK must not get AddressCountry")
	}
	if _, ok := clubs[2]["AddressCountry"]; ok {
		t.Fatal("unresolvable FK must not get AddressCountry")
	}
}
