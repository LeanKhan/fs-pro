# Future Plans

Running log of ideas raised during development that were deliberately **not**
built yet, why, and roughly how each would be implemented when its time
comes. Add to this whenever something gets deferred instead of just dropped
from conversation. Each entry should have enough context that work can start
cold, without re-deriving the reasoning.

Entries are grouped by area. Within a group, newest first.

---

## Match engine

### Effective attributes layer

**Status:** Not started — no consumer yet.

**Why deferred:** Every duel/decision formula in `Decider.ts` and
`Actions.ts` currently reads a player's stats straight off the base object
(`player.Attributes.Mental`, `tackler.Attributes.Aggression`, etc.) — these
are permanent values set once at player generation. There's currently
nothing that needs to *temporarily* change a stat mid-match, so building the
indirection now would be speculative infrastructure with zero real
consumers. Build it alongside the first feature that actually needs it
(most likely [morale system](#morale-system) or [injury system](#injury-system)
below).

**Problem it solves:** Once something *does* need to temporarily adjust a
stat, there are two bad options: mutating `Attributes` directly (fragile —
needs manual bookkeeping to undo, risks leaking into persisted data), or
updating every formula site individually for every new modifier type
(error-prone, unbounded diff every time a new incident type is added).

**Sketch:**
```ts
// FieldPlayer.ts
interface IAttributeModifier {
  attribute: keyof IPlayerAttributes;
  delta: number;
  source: string; // e.g. 'morale:media-backlash', 'injury:knock'
}

class FieldPlayer {
  private activeModifiers: IAttributeModifier[] = [];

  public get EffectiveAttributes(): IPlayerAttributes {
    const effective = { ...this.Attributes };
    for (const mod of this.activeModifiers) {
      effective[mod.attribute] = clamp(effective[mod.attribute] + mod.delta, 0, 100);
    }
    return effective;
  }

  public addModifier(mod: IAttributeModifier) { this.activeModifiers.push(mod); }
  public removeModifiersFrom(source: string) {
    this.activeModifiers = this.activeModifiers.filter((m) => m.source !== source);
  }
}
```
`Decider.ts`/`Actions.ts` get switched from `player.Attributes.X` to
`player.EffectiveAttributes.X` once, mechanically. After that, any new
modifier type is just "register a modifier" — no further engine changes.

**Files:** `classes/FieldPlayer.ts`, `interfaces/Player.ts`, every read site
in `state/ImmutableState/Actions/Decider.ts` and `Actions.ts`.

---

### Morale system

**Status:** Idea only.

**Why:** Named by the user as the first concrete example of a "match
dynamic" incident, alongside cards (built) and injury (below). E.g.
negative media coverage → lower morale → worse decision-making/composure.

**Sketch:** A morale value per player (or per team) that feeds into
`Decider.ts`'s `confidenceThreshold()` and similar formulas via
[effective attributes](#effective-attributes-layer) — e.g. low morale lowers
effective `Mental`/`Composure`, raising the chance of a misplaced pass or
missed shot under pressure. Needs a source for morale changes (results
history, media events, card/injury reactions) — not designed yet.

**Depends on:** [Effective attributes layer](#effective-attributes-layer).

---

### Injury system

**Status:** Idea only.

**Why:** Second named example of a match-dynamic incident — e.g. a knock
could raise `Aggression` ("more fight") while lowering `Speed`/`Stamina`.

**Sketch:** Similar shape to cards (`PlayerMatchStatus` already supports
adding a new value like `'injured'` without redesign — see
`interfaces/Player.ts`). An injury event would either force a substitution
(if subs exist yet — they don't) or apply an
[effective-attribute](#effective-attributes-layer) modifier for the rest of
the match. Needs a decision on whether injuries can end a player's match
entirely, which implies substitutions need to exist first.

**Depends on:** [Effective attributes layer](#effective-attributes-layer),
and probably a substitution system (not designed).

---

### Remaining realism-tuning gaps

**Status:** Deferred, not urgent — user said "I am satisfied with the
results for now."

**What's off:** Per `simRealismCheck.ts`, shots per team still sit around
2.9-4.0 vs. a real-world reference band of 7-18; tackles/interceptions/fouls
are somewhat under their reference bands too (a natural side effect of
fixing the inverted pass-success bug — passes now succeed correctly, so the
ball changes hands defensively less often).

**Diagnosis so far:** Believed structural, not a formula bug — i.e. how
often an attacker gets close enough to goal *with the ball* to justify a
shot, rather than the shoot-decision formula itself being wrong. Not
investigated further.

**Next step when revisited:** Instrument how often attacking players reach
the final third/box with possession per match, compare against the
shots-per-team gap, before touching `Decider.ts`'s shoot thresholds again.

**Files:** `scripts/simRealismCheck.ts` (the diagnostic), `Decider.ts`
(`tryShoot`, `SHOOT_PROFILES`).

---

### Real match data as a tuning baseline

**Status:** Deferred — deliberately chose the simpler path for now.

**Context:** User asked whether real-life match event logs (thousands of
matches) could be used as a baseline for tuning. Decided against sourcing/
building a real dataset for now; went with hand-picked reference ranges from
well-known aggregate stats instead (`REFERENCE_RANGES` in
`simRealismCheck.ts`).

**If revisited:** Would mean sourcing a real event-log dataset (e.g. a
public football event data provider), building an importer, and replacing
the fixed `REFERENCE_RANGES` bands with actual distributions — a
meaningfully bigger effort than the current script, and only worth it if
the hand-picked bands stop being precise enough to guide tuning.

**Files:** `scripts/simRealismCheck.ts`.

---

### Self-improving / ML-driven tuning

**Status:** Exploratory only, no design.

**Context:** User asked whether combining ML techniques with accumulated
match data could produce more realistic play over time, given the game is
web-based and could auto-update its algorithm. Discussed conversationally;
no implementation approach chosen.

**Open questions for later:** What's the training signal (real match stats
again, or player/user engagement)? Where would model inference live
relative to the synchronous, in-process `Game.gameLoop`? How would updated
parameters roll out without breaking `simRealismCheck.ts`'s reference
bands? None of this has been thought through yet — treat as a research
spike, not a scoped feature.

---

### Positional reshuffle after a red card

**Status:** Known simplification, accepted for now.

**Context:** Real teams compress their shape when down a player. Currently
a sent-off player's teammates don't reorganize — the gap is just left; the
departed player stays frozen at their last on-pitch position for the rest
of the match (their `MatchStatus` excludes them from selection via
`MatchSide.ActivePlayers`, but nothing actively closes the space).

**If revisited:** Would likely mean recomputing a temporary 10-man (or
fewer) formation shape on send-off, similar to how `MatchSide.changeTactic`
already reflows positions for a full formation change — reusing that
machinery rather than a bespoke one-off.

**Files:** `classes/Referee.ts` (`sendOff`), `classes/MatchSide.ts`.

---

### Sent-off goalkeeper edge case

**Status:** Known gap, unhandled — noted as rare.

**Context:** If a goalkeeper is sent off, no outfield player takes over in
goal. Not addressed as part of the cards work; left as an accepted edge
case since it's rare in practice.

**Files:** `classes/Referee.ts` (`sendOff`).

---

## Tactics system

### Mid-match tactic changes — interactive/human trigger

**Status:** Engine capability exists; interactive trigger does not.

**Context:** Early in the session the user asked how formation/position
could change mid-match given the match simulates all at once, then said
"let's shelve this for later." The *engine* side ended up built anyway as
part of the broader tactics work — `Game.changeTactic(side, tactic)`
mutates a live `MatchSide.Tactic` and emits a `-tactic-changed` event that
already flows into `Match.Events`/replay frames with no extra plumbing. What
was shelved specifically is a **human-facing control** for triggering it
live (e.g. a manager UI button while watching a match) — that needs a
real-time input channel into the running `Game` instance, which doesn't
exist (the queue/worker-thread model currently only accepts a match's
initial setup, not live commands into an in-flight worker).

**If revisited:** Needs a way to send a command into an already-running
`matchSimWorker` (worker_threads message passing, most likely), plus a
client control surface. Bigger than it looks because of the worker-thread
boundary.

**Files:** `controllers/Game.ts` (`changeTactic` — already done),
`jobs/matchQueue.ts`, `jobs/matchSimWorker.ts`.

---

### Uploadable/custom tactics

**Status:** Extensibility designed in; upload mechanism not built.

**Context:** User asked for an extensible tactics system where users might
eventually "upload tactics in a doc" — explicitly confirmed as
server/engine-only for now, no upload UI or parser to be built at the time.
`FORMATIONS`/`PLAYING_STYLES`/`ITactic`/`resolveTactic()` in
`state/PersistentState/Formations.ts` are shaped so a new formation or style
is just a new data entry, not a code change — but there's no importer,
validation, or file format defined for a user-supplied tactic yet.

**If revisited:** Needs a decision on tactic file format (JSON matching
`ITactic`'s shape is the natural default), a validation/sanitization layer
before anything user-supplied reaches `resolveTactic()`, and a place to
store per-manager custom tactics (currently `manager.model.ts` only stores
`PreferredFormation`/`PreferredStyle` as references into the built-in
tables).

**Files:** `state/PersistentState/Formations.ts`,
`controllers/managers/manager.model.ts`, `manager.service.ts`.

---

## Client / live-watch

### Wire live replay into the real client (matchzone.vue)

**Status:** Done. `matchzone.vue` now joins the `/match-replay` room before
kickoff via `utils/matchReplaySocket.ts` and renders live frames through
`components/matchzone/live-pitch.vue` (a plain-HTML/CSS port of
`PitchPreview.html`'s renderer), holding the final reveal until
`match-replay-end`. The pitch is now the permanent, always-visible
centerpiece of the view rather than something shown only during a live
watch. Kept for reference: `apps/fs-pro-client/src/views/game/PitchPreview.html`
(still the standalone debug tool), server side unchanged
(`realtime/io.ts`, `realtime/matchBroadcaster.ts`).

---

### Replay/rewatch a past match (including friendlies)

**Status:** Paused - was being discussed, then deprioritized in favor of
fixing global render-error handling and the Matchzone redesign first.

**Context:** Right now `startMatchReplay` streams a match's frames exactly
once, at kickoff time (`Match.Frames` is populated and broadcast live, but
nothing persists a way to re-trigger that broadcast later for a match that
already happened). The ask was specifically for friendly matches ("ability
to replay a friendly match, and ability to watch the replay") but the same
gap applies to any past match.

**If revisited:** `Match.Frames` would need to be persisted somewhere
queryable by fixture id (it's currently only ever held in-memory on the
runtime `Match` instance and discarded after the request completes) - most
likely a new field/collection keyed by `Fixture._id`, given `Frames` arrays
are large (one entry per tick) and not something to bolt onto the `Fixture`
document itself. Rewatching would then mean re-driving the exact same
`startMatchReplay(storedFrames, fixtureId)` call the live case already uses,
so the client-side `MatchReplaySocket`/`live-pitch.vue` pieces built for
live-watching need no changes - only a "replay stored frames on demand"
server entry point is new.

**Files:** `classes/Match.ts` (`Frames` capture), `realtime/matchBroadcaster.ts`
(`startMatchReplay` - reusable as-is), a new persistence layer for frames,
a new "rewatch" trigger endpoint, `matchzone.vue`/`friendly-setup.vue` for
a "Watch Replay" entry point.

---

### Render match-dynamic state in the client

**Status:** Data available; not rendered.

**Context:** Frames already carry `matchStatus` per player (added as part
of the cards work) and tactic-change events already reach `Match.Events`,
but no client (including `PitchPreview.html`) visually distinguishes a
sent-off player or shows a tactic change happening live.

**Files:** `apps/fs-pro-client/src/views/game/PitchPreview.html`,
eventually `matchzone.vue`.

---

### Dugout/squad-browsing panel still on Vuetify

**Status:** Deliberately left as-is.

**Context:** When Matchzone's core match-viewing surface (pitch, score,
results, timeline, MOTM, game-lobby) was rewritten from Vuetify to plain
HTML/CSS for a lighter, more "live" feel, the Dugout side panel
(`components/matchzone/widgets/dugout.vue`, `dugout-club.vue`,
`squadlist.vue`, `squadlist-player.vue` - squad browsing, tabs, day-fixtures
list) was explicitly kept on Vuetify. It's a roster-browsing utility, not
part of the live-match feel that prompted the rewrite, and converting it
would have roughly doubled that pass's size. It still renders correctly
embedded in the new plain-HTML layout (Vuetify's theme context comes from
`app-view.vue`'s top-level `<v-app>`, which the rewrite didn't touch).

**If revisited:** Same treatment as the rest of Matchzone - replace
`v-tabs`/`v-window`/`v-list`/`v-avatar` with plain markup, keeping all
existing props/logic (squad sorting, match-selected navigation,
expand/collapse per club) unchanged.

**Files:** `apps/fs-pro-client/src/components/matchzone/widgets/dugout.vue`,
`dugout-club.vue`, `squadlist.vue`, `squadlist-player.vue`.
