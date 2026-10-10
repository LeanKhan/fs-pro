package grid

import (
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
)

// Store errors. They are typed so the HTTP layer can map them to statuses
// without string matching.
var (
	// ErrNoShareCode means the code has never been published (or was removed).
	ErrNoShareCode = errors.New("grid: unknown layout share code")
	// ErrShareCodeTaken means a generated code collided with an existing one;
	// the caller retries with a fresh code.
	ErrShareCodeTaken = errors.New("grid: layout share code already taken")
)

// shareCodeAlphabet is Crockford base32 (no I, L, O, U), exactly 32 symbols so
// the modulo maps a random byte uniformly.
const shareCodeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// shareCodeLen is the number of random symbols after the "FSG-" prefix.
const shareCodeLen = 8

// shareCodePrefix is the fixed, recognisable prefix of every share code.
const shareCodePrefix = "FSG-"

// Published is a layout a club published under a share code, so any manager can
// clone it into one of their own slots (docs/coc-mapping/03 §1.8).
type Published struct {
	Code   string     `json:"code"`
	ClubID string     `json:"clubId"`
	Slot   LayoutSlot `json:"slot"`
	Grid   Grid       `json:"grid"`
}

// NewShareCode returns a fresh "FSG-XXXXXXXX" challenge code, drawn from
// crypto/rand. It is not stored until the repository accepts it.
func NewShareCode() (string, error) {
	buf := make([]byte, shareCodeLen)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("grid: share code: %w", err)
	}
	var b strings.Builder
	b.Grow(len(shareCodePrefix) + shareCodeLen)
	b.WriteString(shareCodePrefix)
	for _, v := range buf {
		b.WriteByte(shareCodeAlphabet[int(v)%len(shareCodeAlphabet)])
	}
	return b.String(), nil
}

// ValidShareCode reports whether s is well-formed, so import refuses junk
// before touching the store.
func ValidShareCode(s string) bool {
	if len(s) != len(shareCodePrefix)+shareCodeLen || !strings.HasPrefix(s, shareCodePrefix) {
		return false
	}
	for _, r := range s[len(shareCodePrefix):] {
		if !strings.ContainsRune(shareCodeAlphabet, r) {
			return false
		}
	}
	return true
}
