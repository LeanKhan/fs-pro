package main

// Domain events carried by the gateway. The gateway itself is event-agnostic:
// it relays whatever a signed /publish sends to a topic's subscribers. These
// names are the contract between the publishers (the Node API, and any future
// Go client) and the browser, so a new event has exactly one place to be named
// and documented (docs/coc-mapping/08 §4; README.md "Topics" / "Protocol").
//
// Raids flow on the defender's private `club:<id>` topic, never on `world`: a
// defender's loss, loot and Rest Window are theirs alone.

const (
	// EventRaidResolved tells a defender that a raid against their stored Home
	// Grid has been resolved. Topic: club:<defenderId> (owner, or an admin).
	// Payload (ids and outcome only; the client refetches the detail):
	//   { "raidId": string, "fixtureId"?: string, "practice": bool,
	//     "stars": 0..3, "score": {"you": int, "them": int},
	//     "stolen": {"cash": number, "fans": int, "tokens": int},
	//     "standing": {"attacker": int, "defender": int},
	//     "shieldUntil"?: iso8601, "guardUntil"?: iso8601 }
	EventRaidResolved = "raid:resolved"

	// EventClubDefended is the pre-P5 name for the same defence notification.
	// It is kept so a browser's existing `club:defended` handler keeps working
	// across cutover (docs/coc-mapping/08 §1/§4). Same topic and payload.
	EventClubDefended = "club:defended"
)

// ClubTopic is a club's private topic: only its owner (or an admin) may join
// (hub.go CanJoin), so an event published here never leaks to another manager.
func ClubTopic(clubID string) string { return "club:" + clubID }
