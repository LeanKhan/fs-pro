package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Claims is who a connection belongs to. The Node API signs them into a
// short-lived ticket (GET /api/realtime/ticket) from the user's session, so
// the gateway never needs the session store or the database.
type Claims struct {
	UserID string   `json:"uid"`
	Name   string   `json:"name"`
	Clubs  []string `json:"clubs"`
	// Code is the short code of the user's first club, shown next to their name.
	Code  string `json:"code,omitempty"`
	Admin bool   `json:"admin,omitempty"`
	// Verified: the account's email is confirmed (or the API doesn't require it).
	Verified bool  `json:"ver,omitempty"`
	Expires  int64 `json:"exp"`
}

func (c Claims) ownsClub(id string) bool {
	for _, club := range c.Clubs {
		if club == id {
			return true
		}
	}
	return false
}

var (
	errBadTicket = errors.New("bad ticket")
	errExpired   = errors.New("ticket expired")
)

func sign(secret, data []byte) []byte {
	mac := hmac.New(sha256.New, secret)
	mac.Write(data)
	return mac.Sum(nil)
}

// IssueTicket is what the Node API does; kept here for tests and tooling.
func IssueTicket(secret []byte, c Claims) (string, error) {
	payload, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	enc := base64.RawURLEncoding
	return enc.EncodeToString(payload) + "." + enc.EncodeToString(sign(secret, payload)), nil
}

// VerifyTicket checks the signature and expiry of "<payload>.<signature>".
func VerifyTicket(secret []byte, ticket string, now time.Time) (Claims, error) {
	var c Claims
	parts := strings.Split(ticket, ".")
	if len(parts) != 2 {
		return c, errBadTicket
	}
	enc := base64.RawURLEncoding
	payload, err := enc.DecodeString(parts[0])
	if err != nil {
		return c, errBadTicket
	}
	mac, err := enc.DecodeString(parts[1])
	if err != nil || !hmac.Equal(mac, sign(secret, payload)) {
		return c, errBadTicket
	}
	if err := json.Unmarshal(payload, &c); err != nil || c.UserID == "" {
		return c, errBadTicket
	}
	if now.Unix() > c.Expires {
		return c, errExpired
	}
	return c, nil
}

// VerifyBody checks a publish request's X-Signature (hex HMAC of the body).
func VerifyBody(secret, body []byte, signature string) bool {
	got, err := hex.DecodeString(signature)
	return err == nil && hmac.Equal(got, sign(secret, body))
}
