package season

import "testing"

func TestBoolParam(t *testing.T) {
	if v, ok := boolParam("true"); !ok || !v {
		t.Fatalf("true = (%v,%v)", v, ok)
	}
	if v, ok := boolParam("false"); !ok || v {
		t.Fatalf("false = (%v,%v)", v, ok)
	}
	if _, ok := boolParam("yes"); ok {
		t.Fatal("invalid must be absent")
	}
}
