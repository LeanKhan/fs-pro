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

The browser calls `GET /api/realtime/ticket` and gets `{ url, ticket }`. The ticket is `base64url(json).base64url(hmac-sha256)` with claims `{ uid, name, clubs, code, admin, exp }`, valid for 10 minutes. The gateway trusts the claims and never touches the session store or the database. Clients fetch a fresh ticket on every reconnect.

## Topics

| Topic | Who may join | What flows |
| --- | --- | --- |
| `world` | anyone signed in | world events, world chat, online count |
| `club:<id>` | that club's owner (or an admin) | challenges, `club:defended`, level changes |
| `campus:<id>` | anyone | who is at that club's ground (presence), ground chat |
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

Chat is allowed on `world` and `campus:*`. Messages are trimmed, have control characters removed and are capped at 280 characters. Each connection may send a burst of 5, then one every 2 seconds. A client that can't keep up with its send buffer is disconnected rather than slowing everyone else.

## Publishing (Node)

`apps/fs-pro-server/src/realtime/world-events.ts`:

- `publish(topics, event, data)`: fire-and-forget, signed with `X-Signature: hex(hmac-sha256(body))`.
- `publishWorldEvent`
- `publishClubEvent`
- `emitOpenPlay` (in `open-play-events.ts`) publishes to `world` plus the private topic of each club it concerns.

## Scaling

One gateway serves one world. To run several, put a broker (Redis pub/sub or NATS) behind `Hub.Publish` and keep presence per node, or move it to the broker. Clients don't change.
