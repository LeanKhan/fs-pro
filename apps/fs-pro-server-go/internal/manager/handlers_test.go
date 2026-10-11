package manager

import "testing"

func TestBoolQuery(t *testing.T) {
	cases := map[string]struct {
		value   bool
		present bool
	}{
		"true":  {true, true},
		"false": {false, true},
		"1":     {false, false},
		"0":     {false, false},
		"":      {false, false},
		"yes":   {false, false},
	}
	for input, want := range cases {
		got, present := boolQuery(input)
		if got != want.value || present != want.present {
			t.Fatalf("boolQuery(%q) = (%v,%v), want (%v,%v)", input, got, present, want.value, want.present)
		}
	}
}

func TestAsBool(t *testing.T) {
	if !asBool(true) || asBool("true") || asBool(nil) {
		t.Fatal("asBool must only accept a real bool")
	}
}
