---
name: Football Simulation Pro (FS-Pro) Cozy Design System
description: Cozy, sunny, flat-shaded football club management visual design system
colors:
  bg-canvas: "#fcf7ee"
  surface-card: "#fffaf0"
  surface-card-alt: "#f8f2e4"
  border-wood: "#e2cc9c"
  border-wood-dark: "#8a5a3b"
  wood-deep: "#3e2723"
  text-primary: "#2c1c0c"
  text-muted: "#6f5940"
  accent-green: "#5cc23a"
  accent-green-dark: "#2f8a1c"
  accent-gold: "#f5b82e"
  accent-sky: "#cfe8ff"
  accent-coral: "#e5402f"
typography:
  display:
    fontFamily: "Fredoka, system-ui, sans-serif"
    fontWeight: 600
  body:
    fontFamily: "Fredoka, system-ui, sans-serif"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
---

## Overview
FS-Pro's visual system evokes a sunny, nostalgic, miniature diorama feel: flat-shaded 3D buildings nestled in manicured lawns, accompanied by warm cream cards, rounded wood borders, and friendly Fredoka typography. The interface feels inviting, tactile, and clear—like a beloved physical board game or diorama come to life.

## Colors
- **Canvases**: Warm sun-washed cream (`#fcf7ee`, `#fffaf0`, `#f8f2e4`). Never cold pure white or dark slate.
- **Borders & Framing**: Toasted wood tones (`#e2cc9c`, `#8a5a3b`, `#3e2723`). Gives buttons and cards physical substance.
- **Accents**:
  - Grass & Pitch Green: `#5cc23a` (fill), `#2f8a1c` (darker contrast text/borders).
  - Trophies & Gold: `#f5b82e`.
  - Sky & Glass: `#cfe8ff`.
  - Alert Coral: `#e5402f`.

## Typography
- **Primary Face**: `Fredoka`, sans-serif. Soft, rounded geometry with cheerful authority.
- **Headings**: Fredoka 600–700 with warm wood foreground colors (`#2c1c0c`).
- **Body & Labels**: Fredoka 400–500, with secondary notes tinted in warm earth tones (`#6f5940`). Never un-tinted sterile gray.

## Layout
- Warm modular cards (`.cem-card`, `.asc-card`) with generous internal breathing room (`12px`–`16px`).
- Tactile icon chips with explicit borders (`border: 2px solid #e2cc9c`).
- Clear visual hierarchy: headline + badge -> progress gauge -> interactive actions.

## Elevation & Depth
- **Flat-shaded 3D**: Low-poly geometric silhouettes with soft directional sunlight, 0.85 roughness, no harsh specular highlights, and warm ground ambient shadows.
- **UI Surfaces**: Subtle offset shadows tinted warm earth (`rgba(138, 90, 59, 0.15)`), reinforced by 2–3px biscuit/wood borders for a tangible toy-like finish.

## Shapes
- Ample pill shapes (`border-radius: 999px`) for progress bars, tags, and status chips.
- Soft rounded rectangles (`12px`–`14px`) for panels and interactive cards.

## Components
- **Cozy Modal (`<cozy-modal>`)**: Cream dialogue box with dark wood pill close button and backdrop.
- **Status Chips**: Pill badges with subtle top-to-bottom sunny gradient (`linear-gradient(#fff8e6, #f1dfb6)`), bounded by `#e2cc9c`.
- **Progress Gauges**: Pill tracks with warm translucent earth backgrounds, filled with vibrant grass-green or gold.

## Do's and Don'ts
- **DO**: Keep all dialogs, sheets, and menus in warm cream and wood tones.
- **DO**: Maintain Fredoka font across all game interfaces.
- **DO**: Use diegetic 3D representation on the campus where possible.
- **DON'T**: Do not use dark mode/slate backgrounds or neon glow/cyberpunk shaders.
- **DON'T**: Do not use photo-realistic textures or complex PBR metallic shaders.
- **DON'T**: Do not use generic cold enterprise UI elements.
