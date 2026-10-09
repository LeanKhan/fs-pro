// Package auth holds the pieces the user/account routes share with the Node
// server: bcrypt hashing at cost 10, the sanitized user wire shape, the user
// and club stores over pgx, one-time email tokens and the route-policy access
// lookups.
package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"sync"

	"golang.org/x/crypto/bcrypt"
)

// BcryptCost matches utils/auth.ts's hashPassword (cost 10).
const BcryptCost = 10

// ErrOffline is returned by the store implementations used when DATABASE_URL is
// not configured.
var ErrOffline = errors.New("database is not configured")

var (
	dummyOnce sync.Once
	dummyHash string
)

// HashPassword hashes a plaintext password at BcryptCost.
func HashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), BcryptCost)
	return string(b), err
}

// ComparePassword reports whether plain matches a stored bcrypt hash.
func ComparePassword(plain, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// DummyHash returns a real bcrypt hash nobody's password matches, so comparing
// against it costs the same as a genuine check (login timing parity).
func DummyHash() string {
	dummyOnce.Do(func() {
		var b [18]byte
		_, _ = rand.Read(b[:])
		h, err := HashPassword("dummy-" + base64.RawURLEncoding.EncodeToString(b[:]))
		if err != nil {
			h = "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva"
		}
		dummyHash = h
	})
	return dummyHash
}
