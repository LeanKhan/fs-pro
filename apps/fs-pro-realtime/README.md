# fs-pro realtime gateway (Go)

The one place browsers hold a live connection. It carries world events, private club notifications, presence and chat. It keeps no game state: the Node API and Postgres are the source of truth, and a client that misses an event just refetches.

```
browser ──ws──▶ gateway :3005 ◀──signed POST /publish── Node API :3000
   ▲                                                       │
   └──────────── GET /api/realtime/ticket (session) ───────┘
```

## Running

- `npm run dev` at the repo root starts it with everything else (turbo runs `go run .`).
- On its own: `go run .` (or `npm run dev` in this folder).
- Tests: `go test ./...`. They cover tickets, topic permissions, publishing, presence, chat history, rate limits, and run end to end over a real WebSocket.

## Environment

| Variable | Default | Used by |
| --- | --- | --- |
| `REALTIME_SECRET` | dev secret, with a warning | gateway and Node API; must match |
| `REALTIME_PORT` | `3005` | gateway |
| `REALTIME_ORIGINS` | `localhost:*,127.0.0.1:*` | gateway (allowed WebSocket origins, comma-separated) |
| `REALTIME_URL` | `http://localhost:3005` | Node API (where it publishes; `off` disables publishing) |
| `REALTIME_PUBLIC_URL` | `REALTIME_URL` | Node API (what browsers connect to, e.g. behind a proxy) |

## Auth

The browser calls `GET /api/realtime/ticket` and gets `{ url, ticket }`. The ticket is `base64url(json).base64url(hmac-sha256)` with claims `{ uid, name, clubs, assocs, code, admin, exp }`, valid for 10 minutes. The gateway trusts the claims and never touches the session store or the database. Clients fetch a fresh ticket on every reconnect.

## Topics

| Topic | Who may join | What flows |
| --- | --- | --- |
| `world` | anyone signed in | world events, world chat, online count |
| `club:<id>` | that club's owner (or an admin) | challenges, inbox, `club:defended` / `raid:resolved`, level changes |
| `campus:<id>` | anyone | who is at that club's ground (presence), ground chat |
| `association:<id>` | a member club's owner (or an admin) | association chat, presence |
| `edition:<id>` | anyone | one competition edition |
| `fixture:<id>` | anyone | one match |

## Protocol

Client to server: `{"op":"sub","topic":"…"}`, `{"op":"unsub","topic":"…"}`, `{"op":"say","topic":"…","text":"…"}`, `{"op":"ping"}`.

Server to client:

- `hello` `{you, online}`
- `event` `{topic, event, data}`
- `presence` `{topic, members:[{uid,name,code}]}`
- `chat` `{topic, id, from, text, at}`
- `history` `{topic, messages}` (the last 50 lines, sent on joining a chat topic)
- `online` `{count}`
- `error` `{message}`
- `pong`

Chat is allowed on `world`, `campus:*`, `town:*` and `association:*`. Messages are trimmed, have control characters removed and are capped at 280 characters. Each connection may send a burst of 5, then one every 2 seconds. A client that can't keep up with its send buffer is disconnected rather than slowing everyone else.

## Moderation

Everything a player says goes through `moderation.go` first, in this order:

1. **Muted?** The player is told until when; the line is dropped.
2. **Unconfirmed email?** They can read but not write (`CHAT_REQUIRE_VERIFIED`, default on; the ticket's `ver` claim, which the Node API sets).
3. **Rate limit**, per account rather than per tab: a burst of 5, then one every 2 seconds.
4. **Screen** (admins skip it): links, the same line twice within 30 seconds, and a word list.

The word list is a short built-in baseline plus your own: `CHAT_BLOCKLIST` (comma-separated) and/or `CHAT_BLOCKLIST_FILE` (one word per line, `#` comments). Words match whole words after undoing look-alikes (`sh1t`, `b!tch`), repeated letters (`fuuuck`) and spelling out (`f.u.c.k`), so "class" and "Scunthorpe" pass. It is a baseline, not a guarantee; keep your real list, slurs included, in the file.

**Reports.** `{"op":"report","topic":"…","id":<message id>,"text":"reason"}`. Five reports a minute per player. When `CHAT_REPORTS_TO_MUTE` (default 3) different players report the same line, its author is muted for ten minutes, their lines are pulled from the history and clients get `{"type":"removed","topic","ids"}`. The reporter gets `{"type":"notice","message"}`. Reports are also written to the log (`chat report: …`).

**Moderator endpoints**, signed like `/publish` (`X-Signature: hex HMAC-SHA256(body)`), all `POST`:

| Path | Body | Does |
| --- | --- | --- |
| `/admin/mute` | `{"uid","minutes","purge"}` | mute for 1 to 43,200 minutes; `purge` removes their lines |
| `/admin/unmute` | `{"uid"}` | lift a mute |
| `/admin/reports` | `{}` | the last 200 reports and who is muted |

The Node API exposes these to signed-in admins as `GET /api/realtime/mod/reports`, `POST /api/realtime/mod/mute` and `POST /api/realtime/mod/unmute`.

Mutes and reports live in the gateway's memory: a restart clears them. That suits mutes of minutes; for permanent bans, act on the account (the API) instead.

Players can also block someone for themselves (stored in their browser) and report from the chat window.

## Publishing (Node)

`apps/fs-pro-server/src/realtime/world-events.ts`:

- `publish(topics, event, data)`: fire-and-forget, signed with `X-Signature: hex(hmac-sha256(body))`.
- `publishWorldEvent`
- `publishClubEvent`
- `emitOpenPlay` (in `open-play-events.ts`) publishes to `world` plus the private topic of each club it concerns.

### Defence events (`raid:resolved`)

A resolved raid is published to the defender's private topic `club:<id>` with
event `raid:resolved` (alias `club:defended`; names and payload in `events.go`).

- The Go defence worker (`internal/play.ResolvePendingRaids`, through the
  `Notifier` seam in `internal/play/raid.go`) writes the durable
  `ClubMessages` row and then, when the gateway is configured, POSTs the
  event through the signed Go client in `internal/realtime` (the mirror of
  `src/realtime/world-events.ts`: `X-Signature: hex(hmac-sha256(body))` over
  `{topics,event,data}`, configured by `REALTIME_URL` + `REALTIME_SECRET`).
  The publish is fire-and-forget with a short timeout: a gateway hiccup is
  logged, never returned, so a raid is never blocked or failed by realtime.
- With `REALTIME_URL`/`REALTIME_SECRET` unset the worker stays durable-only
  (the default): the inbox message is the source of truth and the browser
  reconciles on the next read — no event is faked.

## Scaling

One gateway serves one world. To run several, put a broker (Redis pub/sub or NATS) behind `Hub.Publish` and keep presence per node, or move it to the broker. Clients don't change.
