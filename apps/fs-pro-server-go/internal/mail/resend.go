// Package mail sends transactional email. Without RESEND_API_KEY it logs
// instead of sending (outside production) so local sign-up flows work, matching
// services/mail/mail.service.ts.
package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Mail is one message.
type Mail struct {
	To      string
	Subject string
	HTML    string
	Text    string
}

// Sender sends a message and reports success.
type Sender interface {
	Send(ctx context.Context, m Mail) bool
}

// New returns a Resend-backed sender when RESEND_API_KEY is set, otherwise a
// log-only sender.
func New(logger *slog.Logger) Sender {
	if logger == nil {
		logger = slog.Default()
	}
	if key := strings.TrimSpace(os.Getenv("RESEND_API_KEY")); key != "" {
		return &resendSender{key: key, client: &http.Client{Timeout: 10 * time.Second}, logger: logger}
	}
	return &logSender{logger: logger}
}

// AppURL is where emailed links point, mirroring appUrl().
func AppURL() string {
	if explicit := firstNonEmpty(os.Getenv("APP_URL"), os.Getenv("FSPRO_CLIENT_URL")); explicit != "" {
		return strings.TrimRight(explicit, "/")
	}
	host := strings.TrimSpace(os.Getenv("REMOTE_HOST"))
	if isProduction() && host != "" && host != "localhost" {
		return "https://" + host
	}
	return "http://localhost:8080"
}

// VerificationMail builds the email-verification message.
func VerificationMail(to, name, token string) Mail {
	return layout(to, "Confirm your email for FS Pro",
		"Welcome, "+name+"!",
		"Confirm your email address to found your club and keep your account safe. The link works for 24 hours.",
		"Confirm my email", link("/auth/verify", token),
		"If you didn't create an FS Pro account, you can ignore this email.")
}

// ResetMail builds the password-reset message.
func ResetMail(to, name, token string) Mail {
	return layout(to, "Reset your FS Pro password",
		"Hi "+name+", forgot your password?",
		"Choose a new one with the button below. The link works for one hour and only once.",
		"Choose a new password", link("/auth/reset", token),
		"If you didn't ask for this, ignore this email - your password stays as it is.")
}

func link(path, token string) string { return AppURL() + path + "?token=" + url.QueryEscape(token) }

func layout(to, subject, title, intro, label, linkURL, outro string) Mail {
	html := "<!doctype html><html><body>" +
		"<h1>" + esc(title) + "</h1>" +
		"<p>" + esc(intro) + "</p>" +
		`<p><a href="` + esc(linkURL) + `">` + esc(label) + `</a></p>` +
		"<p>" + esc(linkURL) + "</p>" +
		"<p>" + esc(outro) + "</p>" +
		"</body></html>"
	text := title + "\n\n" + intro + "\n\n" + label + ": " + linkURL + "\n\n" + outro + "\n"
	return Mail{To: to, Subject: subject, HTML: html, Text: text}
}

type logSender struct{ logger *slog.Logger }

func (s *logSender) Send(_ context.Context, m Mail) bool {
	if isProduction() {
		s.logger.Error("RESEND_API_KEY is not set - could not send mail", "subject", m.Subject, "to", m.To)
		return false
	}
	s.logger.Info("mail not sent (no RESEND_API_KEY)", "to", m.To, "subject", m.Subject, "text", m.Text)
	return true
}

type resendSender struct {
	key    string
	client *http.Client
	logger *slog.Logger
}

func (s *resendSender) Send(ctx context.Context, m Mail) bool {
	from := strings.TrimSpace(os.Getenv("MAIL_FROM"))
	if from == "" {
		s.logger.Error("MAIL_FROM is not set")
		return false
	}
	base := strings.TrimRight(firstNonEmpty(os.Getenv("RESEND_API_URL"), "https://api.resend.com"), "/")
	body, _ := json.Marshal(map[string]any{
		"from": from, "to": []string{m.To}, "subject": m.Subject, "html": m.HTML, "text": m.Text,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/emails", bytes.NewReader(body))
	if err != nil {
		return false
	}
	req.Header.Set("Authorization", "Bearer "+s.key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		s.logger.Error("could not reach Resend", "err", err)
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		s.logger.Error("Resend rejected mail", "status", resp.StatusCode, "subject", m.Subject)
		return false
	}
	return true
}

func isProduction() bool { return strings.TrimSpace(os.Getenv("NODE_ENV")) == "production" }

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func esc(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")
	return r.Replace(s)
}
