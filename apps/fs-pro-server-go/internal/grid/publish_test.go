package grid

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestNewShareCodeIsWellFormedAndUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 500; i++ {
		code, err := NewShareCode()
		if err != nil {
			t.Fatalf("NewShareCode: %v", err)
		}
		if !ValidShareCode(code) {
			t.Fatalf("NewShareCode produced a malformed code %q", code)
		}
		if !strings.HasPrefix(code, "FSG-") {
			t.Fatalf("code %q lacks the prefix", code)
		}
		if seen[code] {
			t.Fatalf("duplicate code %q in 500 draws", code)
		}
		seen[code] = true
	}
}

func TestValidShareCode(t *testing.T) {
	valid := []string{"FSG-00000000", "FSG-ABCDEFGH", "FSG-ZYXWVTSR"}
	for _, s := range valid {
		if !ValidShareCode(s) {
			t.Errorf("ValidShareCode(%q) = false, want true", s)
		}
	}
	invalid := []string{"", "FSG-", "FSG-0000000", "FSG-000000000", "fsg-00000000", "FSG-0000000O", "FSG-0000000I", "XX-00000000"}
	for _, s := range invalid {
		if ValidShareCode(s) {
			t.Errorf("ValidShareCode(%q) = true, want false", s)
		}
	}
}

func TestServicePublishImport(t *testing.T) {
	svc := newTestService()
	ctx := context.Background()
	if err := svc.SaveLayout(ctx, "c1", Home, validGrid(), 1); err != nil {
		t.Fatalf("SaveLayout: %v", err)
	}

	pub, err := svc.PublishLayout(ctx, "c1", Home)
	if err != nil {
		t.Fatalf("PublishLayout: %v", err)
	}
	if pub.Slot != Home || pub.ClubID != "c1" || len(pub.Grid.Slots) != Starters {
		t.Errorf("published = %+v", pub)
	}

	g, err := svc.ImportLayout(ctx, pub.Code, "c2", Match, 5)
	if err != nil {
		t.Fatalf("ImportLayout: %v", err)
	}
	if len(g.Slots) != Starters {
		t.Errorf("imported grid has %d slots", len(g.Slots))
	}
	if _, _, err := svc.MatchPayload(ctx, "c2", Match); err != nil {
		t.Errorf("imported layout not persisted: %v", err)
	}
}

func TestServicePublishEmptySlotIsErrNoLayout(t *testing.T) {
	svc := newTestService()
	if _, err := svc.PublishLayout(context.Background(), "c1", Home); !errors.Is(err, ErrNoLayout) {
		t.Fatalf("err = %v, want ErrNoLayout", err)
	}
}

func TestServiceImportUnknownCode(t *testing.T) {
	svc := newTestService()
	if _, err := svc.ImportLayout(context.Background(), "FSG-00000000", "c1", Home, 5); !errors.Is(err, ErrNoShareCode) {
		t.Fatalf("err = %v, want ErrNoShareCode", err)
	}
}

func TestServiceImportRejectsUnknownSlot(t *testing.T) {
	svc := newTestService()
	_, err := svc.ImportLayout(context.Background(), "FSG-00000000", "c1", LayoutSlot("away"), 5)
	var invalid InvalidLayoutError
	if !errors.As(err, &invalid) {
		t.Fatalf("err = %v, want InvalidLayoutError", err)
	}
}

func TestMemoryRepositoryRejectsDuplicateCode(t *testing.T) {
	repo := NewMemoryRepository()
	ctx := context.Background()
	if err := repo.Publish(ctx, "FSG-ABCDEFGH", "c1", Home, validGrid()); err != nil {
		t.Fatalf("first publish: %v", err)
	}
	if err := repo.Publish(ctx, "FSG-ABCDEFGH", "c2", Home, validGrid()); !errors.Is(err, ErrShareCodeTaken) {
		t.Fatalf("duplicate publish err = %v, want ErrShareCodeTaken", err)
	}
}
