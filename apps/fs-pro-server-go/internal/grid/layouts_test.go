package grid

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestValidSlot(t *testing.T) {
	for _, s := range []LayoutSlot{Home, Match, Derby} {
		if !ValidSlot(s) {
			t.Errorf("ValidSlot(%q) = false, want true", s)
		}
	}
	for _, s := range []LayoutSlot{"", "Home", "away", "defence"} {
		if ValidSlot(s) {
			t.Errorf("ValidSlot(%q) = true, want false", s)
		}
	}
}

func TestLayoutsGrid(t *testing.T) {
	l := Layouts{Home: validGrid()}
	if _, ok := l.Grid(Home); !ok {
		t.Error("Grid(Home) reported an empty slot")
	}
	if _, ok := l.Grid(Derby); ok {
		t.Error("Grid(Derby) reported a populated slot")
	}
}

func TestLayoutsSlotsIsCanonical(t *testing.T) {
	l := Layouts{Derby: validGrid(), Home: validGrid()}
	got := l.Slots()
	want := []LayoutSlot{Home, Derby}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Slots() = %v, want %v", got, want)
	}
}

func TestLayoutsJSONRoundTrip(t *testing.T) {
	original := Layouts{Home: validGrid(), Match: validGrid(), Derby: validGrid()}
	b, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var back Layouts
	if err := json.Unmarshal(b, &back); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !reflect.DeepEqual(original, back) {
		t.Fatalf("round-trip mismatch:\n original=%+v\n back=%+v", original, back)
	}
}

func TestLayoutsMarshalEmptyIsObject(t *testing.T) {
	for _, l := range []Layouts{nil, {}} {
		b, err := json.Marshal(l)
		if err != nil {
			t.Fatalf("marshal %v: %v", l, err)
		}
		if string(b) != "{}" {
			t.Errorf("marshal %v = %s, want {}", l, b)
		}
	}
}

func TestLayoutsUnmarshalRejectsUnknownSlot(t *testing.T) {
	var l Layouts
	if err := json.Unmarshal([]byte(`{"away":{}}`), &l); err == nil {
		t.Fatal("an unknown slot key must be refused")
	}
}
