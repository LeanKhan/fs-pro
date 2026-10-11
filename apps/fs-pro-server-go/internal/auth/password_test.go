package auth

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

// nodeHash is produced by the Node bcryptjs the server uses:
//
//	bcrypt.hashSync('correct horse battery staple', 10)
const nodeHash = "$2a$10$bIzfYUAQC6/j1ze7UzrFmOy0ErCjtxyRxdmgpAmhSVagQ.3z./uSO"

func TestComparePasswordAcceptsNodeHash(t *testing.T) {
	if !ComparePassword("correct horse battery staple", nodeHash) {
		t.Fatal("Go must accept a Node-produced bcrypt hash")
	}
	if ComparePassword("wrong password", nodeHash) {
		t.Fatal("wrong password must not match")
	}
}

func TestHashPasswordUsesCost10AndRoundTrips(t *testing.T) {
	hash, err := HashPassword("hunter2hunter2")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	cost, err := bcrypt.Cost([]byte(hash))
	if err != nil {
		t.Fatalf("bcrypt.Cost: %v", err)
	}
	if cost != BcryptCost {
		t.Fatalf("cost = %d, want %d", cost, BcryptCost)
	}
	if !ComparePassword("hunter2hunter2", hash) {
		t.Fatal("Go-produced hash must verify")
	}
}

func TestDummyHashIsARealHash(t *testing.T) {
	d := DummyHash()
	if _, err := bcrypt.Cost([]byte(d)); err != nil {
		t.Fatalf("dummy hash is not a valid bcrypt hash: %v", err)
	}
	if ComparePassword("dummy-anything", d) {
		t.Fatal("no real password should match the dummy hash")
	}
}

func TestSanitizeUserStripsSecrets(t *testing.T) {
	user := map[string]any{
		"_id":             "u1",
		"FullName":        "Ada",
		"Password":        "hash",
		"Session":         "sid",
		"EmailVerifiedAt": "2026-01-01T00:00:00.000Z",
		"Email":           "ada@example.com",
	}
	out := SanitizeUser(user)
	if _, ok := out["Password"]; ok {
		t.Fatal("Password must be stripped")
	}
	if _, ok := out["Session"]; ok {
		t.Fatal("Session must be stripped")
	}
	if _, ok := out["EmailVerifiedAt"]; ok {
		t.Fatal("EmailVerifiedAt must be stripped")
	}
	if out["EmailVerified"] != true {
		t.Fatalf("EmailVerified = %v, want true", out["EmailVerified"])
	}
	if SanitizeUser(nil) != nil {
		t.Fatal("nil user sanitizes to nil")
	}
}

func TestSanitizeUserUnverified(t *testing.T) {
	out := SanitizeUser(map[string]any{"_id": "u1", "EmailVerifiedAt": nil})
	if out["EmailVerified"] != false {
		t.Fatalf("EmailVerified = %v, want false", out["EmailVerified"])
	}
}
