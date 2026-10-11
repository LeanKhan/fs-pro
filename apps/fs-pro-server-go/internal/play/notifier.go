package play

import (
	"context"

	"fs-pro-server/internal/db"
)

// Realtime event names on the defender's private topic. The values are the
// contract with apps/fs-pro-realtime/events.go (EventRaidResolved /
// EventClubDefended) and the browser; they are duplicated here (separate Go
// modules) rather than shared, exactly as the topic string is.
const (
	// EventRaidResolved is the canonical P5 defence notification.
	EventRaidResolved = "raid:resolved"
	// EventClubDefended is the pre-P5 alias for the same notification on the
	// same topic. It is exported so a consumer can key on it during cutover.
	EventClubDefended = "club:defended"
)

// ClubTopic is a club's private gateway topic: only its owner (or an admin)
// may join it (apps/fs-pro-realtime hub.go CanJoin), so a defence notice
// published here never leaks to another manager.
func ClubTopic(clubID string) string { return "club:" + clubID }

// RealtimePublisher sends one event to a set of topics. It is satisfied by
// *realtime.Client but declared here so the play package does not depend on
// the transport. Publish is fire-and-forget: it must not block or return an
// error.
type RealtimePublisher interface {
	Publish(topics []string, event string, data any)
}

// RealtimeNotifier is the wired Notifier: it writes the durable ClubMessages
// row (so the inbox is the source of truth) and then publishes raid:resolved
// to the defender's private topic. The publish rides after the durable write
// and is fire-and-forget, so a gateway hiccup never blocks or fails the raid;
// the browser reconciles from the inbox on its next read.
type RealtimeNotifier struct {
	// durable writes the inbox row. Defaults to ClubMessageNotifier{}.
	durable Notifier
	// publisher posts the live event. When nil (unconfigured) only the durable
	// write happens.
	publisher RealtimePublisher
}

// NewRealtimeNotifier builds the notifier for the configured publisher. It
// keeps the durable inbox write as the default transport underneath.
func NewRealtimeNotifier(publisher RealtimePublisher) *RealtimeNotifier {
	return &RealtimeNotifier{durable: ClubMessageNotifier{}, publisher: publisher}
}

// RaidResolved writes the durable message first, then publishes the defence
// event. Only a durable-write failure is returned (and rolls the raid back);
// the realtime hop is best-effort.
func (n *RealtimeNotifier) RaidResolved(ctx context.Context, q db.Querier, notice DefenseNotice) error {
	if n.durable != nil {
		if err := n.durable.RaidResolved(ctx, q, notice); err != nil {
			return err
		}
	}
	if n.publisher == nil {
		return nil
	}
	n.publisher.Publish([]string{ClubTopic(notice.DefenderID)}, EventRaidResolved, RaidResolvedPayload(notice))
	return nil
}

// RaidResolvedPayload builds the JSON object documented in
// apps/fs-pro-realtime/events.go: ids and the outcome only, so the client can
// refetch the detail. "score.you" is always the defender's score (the notice
// is the defender's). Optional keys (fixtureId, shieldUntil, guardUntil) are
// omitted when absent.
func RaidResolvedPayload(n DefenseNotice) map[string]any {
	payload := map[string]any{
		"raidId":       n.RaidID,
		"practice":     n.Practice,
		"stars":        n.Stars,
		"attackerId":   n.AttackerID,
		"attackerName": n.AttackerName,
		"attackerCode": n.AttackerCode,
		"score":        map[string]any{"you": n.DefenderGoals, "them": n.AttackerGoals},
		"stolen": map[string]any{
			"cash":   n.StolenCash,
			"fans":   n.StolenFans,
			"tokens": n.StolenTokens,
		},
		"standing": map[string]any{"attacker": n.StandingAttacker, "defender": n.StandingDefender},
	}
	if n.FixtureID != "" {
		payload["fixtureId"] = n.FixtureID
	}
	if n.ShieldUntil != nil {
		payload["shieldUntil"] = db.ISO8601msUTC(*n.ShieldUntil)
	}
	if n.GuardUntil != nil {
		payload["guardUntil"] = db.ISO8601msUTC(*n.GuardUntil)
	}
	return payload
}
