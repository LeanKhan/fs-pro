package atlas

import "testing"

func TestNameAvailability(t *testing.T) {
	if got := NameAvailability(nil); !got.OK || got.Problem != nil {
		t.Fatalf("free name = %+v", got)
	}
	got := NameAvailability([]string{"Ashter"})
	if got.OK || got.Problem == nil {
		t.Fatalf("taken name = %+v", got)
	}
}

func TestFoundingRefusal(t *testing.T) {
	if _, refuse := FoundingRefusal(true, false, false, true, false, false); refuse {
		t.Fatal("town provided must not refuse")
	}
	msg, refuse := FoundingRefusal(true, true, true, true, false, false)
	if !refuse || msg == "" {
		t.Fatalf("missing region must refuse 409, got (%q,%v)", msg, refuse)
	}
	msg, refuse = FoundingRefusal(true, false, false, false, false, false)
	if !refuse || msg == "" {
		t.Fatalf("missing town must refuse 409, got (%q,%v)", msg, refuse)
	}
}
