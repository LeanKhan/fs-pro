package mail

import (
	"context"
	"strings"
	"testing"
)

func TestLogSenderSendsOutsideProduction(t *testing.T) {
	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("NODE_ENV", "dev")
	if !New(nil).Send(context.Background(), VerificationMail("a@example.com", "Ada", "tok")) {
		t.Fatal("log sender should report success outside production")
	}
}

func TestVerificationMailContainsToken(t *testing.T) {
	t.Setenv("APP_URL", "https://play.example.com/")
	m := VerificationMail("a@example.com", "Ada", "tok123")
	if m.To != "a@example.com" {
		t.Fatalf("to = %q", m.To)
	}
	if !strings.Contains(m.Text, "https://play.example.com/auth/verify?token=tok123") {
		t.Fatalf("text missing link: %s", m.Text)
	}
	if !strings.Contains(m.HTML, "tok123") {
		t.Fatalf("html missing token: %s", m.HTML)
	}
}

func TestResetMailUsesResetPath(t *testing.T) {
	t.Setenv("APP_URL", "")
	m := ResetMail("a@example.com", "Ada", "abc")
	if !strings.Contains(m.Text, "/auth/reset?token=abc") {
		t.Fatalf("text = %s", m.Text)
	}
}
