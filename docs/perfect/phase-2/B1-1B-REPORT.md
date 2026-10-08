# B1-1B-REPORT.md — advisor design + art

Agent: 1B (advisor design + art). Branch: `p2/b1-1b`, worktree
`.claude/worktrees/p2b1b` (from `p2/integration` @ `eb04591`). Date: 2026-10-07.

## Deliverables

- `docs/perfect/phase-2/ADVISOR-SPEC.md` — character, expressions, motion,
  layout, content model, accessibility, art record, and an `impeccable` critique
  of the mockups.
- Portrait art: `apps/fs-pro-client/src/components/cozy/advisor/` (generator +
  5 expression SVGs + contact sheet + motion proof).
- Spec assets and screenshots: `docs/perfect/phase-2/assets/advisor/`.

## Files changed

```
new  apps/fs-pro-client/src/components/cozy/advisor/portrait.mjs
new  apps/fs-pro-client/src/components/cozy/advisor/README.md
new  apps/fs-pro-client/src/components/cozy/advisor/advisor-{neutral,happy,excited,worried,thinking}.svg
new  apps/fs-pro-client/src/components/cozy/advisor/advisor-contact-sheet.svg
new  apps/fs-pro-client/src/components/cozy/advisor/advisor-motion.html
new  docs/perfect/phase-2/ADVISOR-SPEC.md
new  docs/perfect/phase-2/assets/advisor/  (mockups, screenshots, SVGs, detector output)
new  docs/perfect/phase-2/B1-1B-REPORT.md
```

## Commands and results

```text
$ node portrait.mjs
wrote 6 files:
  advisor-neutral.svg … advisor-contact-sheet.svg   (+ advisor-motion.html)   # PASS

$ npx -y impeccable detect advisor-mock.html advisor-motion.html
1 anti-pattern found.        # cramped-padding on .stage — false positive (full-bleed canvas)
4 advisory notes.            # repeating-stripes-gradient (sight-line) + 3x shape-assembled-illustration
# (before the fix: 6 anti-patterns incl. 5 low-contrast on --muted #8b7357 = 4.1:1)

$ python3 -c "import xml.dom.minidom; ... parse every advisor-*.svg"
svg files checked, bad = 0   # PASS

$ chrome --headless=new --screenshot=… --window-size=1440,900 "…/advisor-mock.html?size=desktop&expr=happy"
… advisor-desktop-1440x900.png / advisor-desktop-point.png / advisor-mobile-390x844.png / advisor-mobile-point.png
```

## Criteria → evidence

| Criterion | PASS | Evidence |
| --- | --- | --- |
| Name from a starting culture, personality, voice | PASS | `ADVISOR-SPEC.md` §1 (Kev; `services/worldgen/names/data/cultures/kev.json`) |
| 4–6 expressions | PASS | 5: `advisor-*.svg`; `advisor-contact-sheet.svg` |
| Motion: enter, idle (bob+blink), talk, exit, point | PASS | `ADVISOR-SPEC.md` §3; `advisor-motion-proof.png` |
| Layout per breakpoint, never covers PLAY/dock/HUD, 390×844 | PASS | §4; `advisor-desktop-1440x900.png`, `advisor-mobile-390x844.png` |
| Content model: trigger/priority/cooldown/max-shows, server-side dismissal | PASS | §5 (rule table 5.4; state 5.1; dismissal 5.5) |
| Deterministic/rule-based, no LLM | PASS | §5, §5.3 sort rule |
| Accessibility: aria-live, Enter to advance, reduced-motion | PASS | §6 |
| impeccable critique of the mockups | PASS | §8 (degraded banner + heuristics + detector) |
| Art: L9 order recorded | PASS | §0 — (a) blocked (`GEMINI_API_KEY=MISSING`, no `uv`); (b) chosen |

## Assumptions / gaps

- Art path (a) not attempted beyond the credential probe (no key, no `uv`),
  per L9/SKILL.md recovery.
- Advisor name and all lines are drafts; they must be frozen with 1A's
  `OWNER-PROGRAM-SPEC.md` step ids before 2A/3A implement.
- Lead-level finding: the shared `--muted` token (`cozy.scss:10`, `#8b7357`)
  fails WCAG AA on cream (4.1:1) across the client — recommend a Batch-4 sweep.
- `impeccable` installed global (opencode), project copy removed so no 18 MB
  binary is committed.
