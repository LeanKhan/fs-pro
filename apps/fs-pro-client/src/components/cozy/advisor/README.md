# Advisor portrait art

Hand-built, layered, flat-shaded SVG portraits for **Vintra**, the club owner's
advisor (L9 path **b**). One generator, six outputs, no runtime dependencies.

| File | What it is |
| --- | --- |
| `portrait.mjs` | The generator. Palette, geometry, expressions and the self-contained CSS. Run `node portrait.mjs` to rewrite every `.svg`/`.html` below. |
| `advisor-neutral.svg` | Neutral: eyes open, closed smile, brow level. Default listening face. |
| `advisor-happy.svg` | Happy: soft arc eyes, open smile, cheeks. |
| `advisor-excited.svg` | Excited: wide eyes, grin, flat gold sparkles. |
| `advisor-worried.svg` | Worried: eyes aside, brows up-inner, frown, one sweat bead. |
| `advisor-thinking.svg` | Thinking: eyes up, one brow raised, pursed mouth, chin-rest hand. |
| `advisor-contact-sheet.svg` | Every expression + both point poses, for QA and the spec. |
| `advisor-motion.html` | Frozen blink / talk frames proving the shared layers stack. |

Each expression file also carries **two hidden point arms** (`adv-point-right` /
`adv-point-left`). The root's `adv-pose-point-<side>` class shows one; the arm's
`.adv-pointer` group rotates by `--adv-aim` to aim at the projected building.

---

## The component (Batch 3A)

`CozyAdvisor.vue` is **the one advisor component**, used by the campus (docked
bottom-left) and by the drawers and founding flow (`mode="inline"`). It renders
the inlined SVG above, so the art's own bob/blink/talk CSS and reduced-motion
gating run unchanged.

```html
<CozyAdvisor
  :club-id="clubId"          <!-- omit to drive it yourself via show() -->
  mode="campus"              <!-- or "inline" -->
  :suspended="matchOpen"      <!-- pauses while a match/drawer owns the screen -->
  :marker="projectedAnchor"   <!-- { x, y, visible } viewport px, for pointing -->
  :source="myAdvisorSource"   <!-- optional; default is the API source -->
  @advance="..." @dismiss="..." @update:quiet="..." @point="..."
/>
```

Driven by one Pinia store, `use-advisor.ts` (`useAdvisorStore`):

- `configure(clubId, { own, src })` then `load()` — pulls the step line from
  `GET /program/:clubId` and the contextual tip from the Go `POST /program/tip`
  engine. The client reaches Go through the Node proxy `POST /program/:clubId/tip`
  (the Batch-3C seam; a 404 is cached and the step line still guides the owner).
- `advance()` (Enter), `dismissCurrent()` (Esc; never discards a program line),
  `setQuiet()`, `push(line)` (founding), `markerLive(now)` (6s marker window).

Selection is deterministic and mirrors PROGRAM-SERVICE-CONTRACT §6 —
`advisor-content.ts` holds the priority bands, the eligibility filters
(dismissed / max-shows / cooldown / quiet) and the priority-desc, id-asc sort.

### Accessibility

The whole line is always in the DOM (an sr-only span) inside a
`role="status" aria-live="polite" aria-atomic` region; the typewriter only
toggles a visible, `aria-hidden` copy, so a screen reader never hears a
half-typed word. The container is focusable (Enter/Space advance, Esc
dismisses); every control is ≥44×44. All motion is gated behind
`prefers-reduced-motion`.

### Dev lab

`apps/fs-pro-client/advisor-lab.html` mounts the real component over the app's
own `cozy.scss` HUD/dock/PLAY geometry with a scripted source, and exposes
`window.__ADVISOR_TEST_HOOKS__`. `tests/e2e/specs/advisor.spec.ts` screenshots
every state at 1440×900 and 390×844, asserts the advisor never overlaps
PLAY/dock/HUD/presence, and checks reduced motion, keyboard and `aria-live`.


## Using it

Every file is a standalone SVG with a transparent background, `role="img"` and an
`aria-label`. Three ways to consume it:

```html
<!-- 1. Static expression (the SVG's own CSS still runs the blink/talk loops) -->
<img src="@/components/cozy/advisor/advisor-happy.svg" alt="" aria-hidden="true" />

<!-- 2. Inline, then drive state with classes on the root <svg> -->
<!--    class="adv expr-<neutral|happy|excited|worried|thinking>
<!--              adv-state-<idle|talking>  adv-pose-<idle|point-right|point-left>" -->

<!-- 3. CSS background-image for a card art slot -->
```

State classes (set them on the root `<svg>` when inline):

- `expr-*` — which expression was generated. A file is one expression; this class
  is mostly for debugging and for `:is()` styling hooks.
- `adv-state-talking` — hides the resting mouth and cycles the four talk visemes.
- `adv-pose-point-right` / `adv-pose-point-left` — the raised arm + pointer. The
  `.adv-pointer` group carries `transform-origin` at the hand; the component
  rotates it to aim at a projected building anchor.
- The idle **bob** and the **blink** run by default and are gated behind
  `@media (prefers-reduced-motion: no-preference)` inside each SVG.

Club colours: `bandA` (kit) and `bandB` (scarf/trim) are constants in
`portrait.mjs`. To tint per club, expose them as CSS variables and replace the
literal fills, or override `.adv-figure [fill="#5cc23a"]`. Batch 3 owns the
component; this folder owns only the art.

## Regenerating

```bash
cd apps/fs-pro-client/src/components/cozy/advisor
node portrait.mjs        # writes advisor-*.svg + advisor-motion.html
```

Art direction (R8): cozy, flat-shaded, sunny, cream/wood, Fredoka. Never dark or
realistic. The palette mirrors `../cozy.scss` tokens.
