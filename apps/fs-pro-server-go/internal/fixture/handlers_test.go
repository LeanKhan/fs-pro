package fixture

import (
	"net/url"
	"testing"
)

func TestBoolParam(t *testing.T) {
	q := url.Values{"played": {"false"}, "light": {"true"}, "empty": {""}}
	if v, ok := boolParam(q, "played"); !ok || v {
		t.Fatalf("played = (%v,%v)", v, ok)
	}
	if v, ok := boolParam(q, "light"); !ok || !v {
		t.Fatalf("light = (%v,%v)", v, ok)
	}
	if _, ok := boolParam(q, "empty"); !ok {
		t.Fatal("empty value is present")
	}
	if _, ok := boolParam(q, "absent"); ok {
		t.Fatal("absent must not be present")
	}
}

func TestIntParam(t *testing.T) {
	q := url.Values{"scheduledDay": {"12"}, "bad": {"x"}}
	if v, ok := intParam(q, "scheduledDay"); !ok || v != 12 {
		t.Fatalf("scheduledDay = (%v,%v)", v, ok)
	}
	if _, ok := intParam(q, "bad"); ok {
		t.Fatal("non-numeric must be absent")
	}
	if _, ok := intParam(q, "absent"); ok {
		t.Fatal("absent must be absent")
	}
}
