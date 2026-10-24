# Gridzilla board: design system

Decoded from apple.com production CSS (2026-10-24: `/v/macbook-pro/ax/built/styles/overview.built.css`,
`/v/apple-vision-pro/l/built/styles/overview.built.css`, `globalheader.css`, `ac-localnav.built.css`).
These are the only tokens in the app (`src/index.css` `@theme`, `src/model.ts` `COLORS`). Do not invent others.

## Colour (monochrome + one hue)

| token | value | Apple source |
|---|---|---|
| ground | `#F5F5F7` | `rgb(245,245,247)`, section and tile background (83 uses) |
| card | `#FFFFFF` | `--sk-tile-background: rgb(255,255,255)` |
| ink | `#1D1D1F` | body and headline text (`#1d1d1f`, 95 uses) |
| secondary | `#6E6E73` | secondary copy (`#6e6e73`) |
| tertiary | `#86868B` | captions, legal, axis text (`#86868b`) |
| fill | `#E8E8ED` | segmented track, quiet button (`#e8e8ed`) |
| fill-press | `#D2D2D7` | pressed / hairline fill where unavoidable (`#d2d2d7`) |
| primary button | `#1D1D1F`, hover `#272729`, active `#18181A` | `--sk-button-background(-hover/-active)` dark variant |
| red | `#FF3B30` | Apple system red. The ONLY hue: over the limit (either direction), refused, official warning |

Taking vs giving power is never a colour. It is direction: above or below the zero line, an arrow, line vs filled area.
Following Gridzilla is ink (a solid dark marker / filled shape); not following is tertiary or white.

## Type

- Stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter Variable", "Inter", system-ui, sans-serif`. Inter is bundled for non-Mac projectors.
- Weights: 600 for headlines and numbers (284 uses on apple.com), 400 for body. Nothing else except 500 for button labels.
- Scale (Apple sizes, px at a 1440 wide viewport; `html` font-size scales them for the projector): 12 caption, 14 body-reduced, 17 body, 21, 24, 28, 32 headline, 48, 64 hero number, 80.
- Tracking: headlines `-0.009em` to `-0.003em` (≥48px), `.004em`-`.011em` (21-32px), body `-0.022em` (17px), body-reduced `-0.016em` (14px). Big numbers `-0.015em`.
- Line height: 1.0625 hero, 1.1 headline, 1.4705 body, 1.4286 body-reduced.
- All live numbers `font-variant-numeric: tabular-nums`.
- No uppercase tracked eyebrows. No text cut with an ellipsis: wrap or shorten the copy.

## Shape and depth

- Card radius 18px (`--sk-tile-border-radius-large: 18px`); controls 980px pill (`--sk-button-border-radius: 980px`) or 12px.
- Card shadow: Apple tile `8px 8px 16px 0 rgba(0,0,0,0.08)`, softened for a dashboard to `0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`. Depth by shadow, never by borders.
- Focus ring: `0 0 0 3px #fff, 0 0 0 5px #1D1D1F` (Apple's double ring, inked instead of blue).

## Buttons

- Primary: ink fill, white text, pill, padding 11px 22px (`--sk-button-padding-*`), hover `#272729`, pressed `#18181A` + `scale(.98)`.
- Secondary: white fill on ground, or `#E8E8ED` on white cards; ink text; hover one step darker (`#EDEDF2`/`#D2D2D7`).
- Segmented control: `#E8E8ED` track, white selected thumb with the card shadow, ink text, 980px radius.

## Motion

- Only one ongoing motion: power dots moving along the wires in the 3D street.
- State changes: `0.25s cubic-bezier(0,0,0.5,1)` (Apple's ease-out `cubic-bezier(0,0,0.5,1)`). Buttons `background-color 100ms linear` like apple.com.
- No entrance animations, no fades on load, no springs, no pulsing, no number rolling.

## Banned

Gradients, glows, neon, coloured or glowing borders, glass/blur, pulsing or sonar rings, dark theme, more than one hue,
chips everywhere (max one small status badge per card), eyebrow labels, decorative hairlines, emoji-like icons,
ellipsis truncation, sample data shown as real (sample weather only with `?weather=sample`).

## Round 3: the one stage (resources used)

- Skills: website-design, design-taste-frontend, frontend-design, ui-ux-pro-max, dataviz (spec in `design/STAGE.md`).
- 21st.dev components adapted (reference sources and notes in `design/COMPONENTS.md`, `design/21st/`):
  Apple Activity Ring (@kokonutd, 3223) -> `src/stage/kit/LoadRing.tsx`; Circle Progress countdown (@hihahihahoho, 1737) ->
  `src/stage/kit/Countdown.tsx`; Stats Bento (@uilayout.contact, 25311) -> the facts strip `src/stage/one/Facts.tsx`; stepper-03
  (@shadcnspace, 28558) -> `src/stage/one/AiCard.tsx`; Animate Digits (@unlumen, 20071) -> the top-bar clock digits; Chart Area
  (@uiable, 30819) -> pattern for the gap fill in `src/stage/kit/LiveCurve.tsx` (own engine kept for label collision avoidance).
- Real Apple references: apple.com production CSS (tokens above), iOS Home Grid Forecast / Electricity, Weather app, Watch rings.
- 3D: Kenney City Kit (Suburban), CC0, `public/models/` with its License.txt.
- Round 2/3 colour rule: Apple system colours with one meaning each (`src/stage/palette.ts`); on the curve the pitch script's words:
  blue with Gridzilla, grey dashed without, orange the peak eaten, green the plan, red the limit.
- Gates: `qa/README.md` (`npm run qa`).
