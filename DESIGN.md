# DESIGN.md

The design system for this site. It is the only authority on type, colour, spacing and layout: `src/styles/tokens.css` mirrors the tokens below, stylelint enforces them, and the design critic (`evals/design-critic/`) scores pages against this file. Change this file and `tokens.css` together.

## References

- **Primary: pi.dev**, in its light theme. The model for type, colour, texture and density: an old-style serif at a generous reading size, slate ink on warm paper, small mono labels, hairline rules and nothing loud.
- **Secondary: lefos.com.** Visual reference only (no values are taken from it): italic serif display headings and calm, compact text blocks.

Reference screenshots are captured at runtime into the uncommitted `.cache/reference/` by `scripts/reference-screens.ts` (at most once a day; the cached copy is used, with a note, when the site is unreachable). No third-party screenshot, logo, name or mark is ever committed or shown on the built site.

## Character

Compact, tidy and quiet. Text blocks are neat and justified-feeling, headers are modest, and the page reads like a well-set document, not a landing page. The opposite of "big headers, fonts, pictures and boxes".

## Type

- **Body and headings: one old-style serif** with the feel of the Plantin family (robust, slightly condensed, large x-height). pi.dev sets its body in Plantin at about 22px; this site uses a free (OFL) serif chosen from a side-by-side comparison (see "Fonts"). Body weight is a touch above regular (450).
- **Display headings: the same serif, in italic**, as on lefos.com. `h1` and `h2` are italic; `h3` is upright semibold. Headings stay small: `h1` is 1.875rem (about 34px).
- **UI, labels, metadata and terminal-style boxes: Departure Mono**, falling back to Commit Mono, then the system mono. Labels are 11px, uppercase, tracked at 0.12em.
- Root size 18px. Body 1.02rem (about 18px) on narrow screens and 1.22rem (about 22px) from 48rem up. Line height 1.55. Paragraphs are justified with hyphenation; `text-wrap: pretty` on body, `balance` on headings.

## Colour

Light only for now. Warm paper, slate ink, one restrained accent.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#ebe7e4` | page background |
| `--paper-deep` | `#dacbc2` | deeper paper, rare fills |
| `--paper-raised` | `#f3f2f0` | the rare raised surface |
| `--ink` | `rgba(37,47,61,.96)` (`#252f3df5`) | body text and headings: slate, never black |
| `--ink-soft` | `#384251dc` | secondary copy |
| `--muted` | `#5c5752` | labels, metadata |
| `--link` / `--accent` | `rgb(75,96,124)` (`#4b607c`) | links and the one accent |
| `--accent-warm` | `#844f3b` | very sparing warm accent; never large areas |
| `--line` / `--line-strong` | `#8b847d59` / `#5c57528c` | hairlines, underlines |
| `--selection`, `--focus-ring` | `#4b607c24`, `#4b607c80` | selection and focus |

**Paper texture:** a faint 20px grid and a light grain, drawn as inline SVG (`--paper-texture`), as on pi.dev. Never a CSS gradient.

Contrast: `--ink`, `--muted` and `--link` all meet WCAG AA for body text on `--paper` (checked by axe on every built page).

## Layout

- One narrow column, `--measure` 36rem (about 65 characters), centred, with `--gutter` side padding (1rem, 2rem from 48rem up).
- Compact vertical rhythm from the spacing scale; sections separated by a hairline and `--space-7`, not by boxes.
- Modest headers: a mono label, then a small italic heading. No hero.
- Lists are plain; boxes are rare, mono, hairline-bordered, unfilled.

## Tokens

All in `src/styles/tokens.css`. Components use only these (stylelint: `scale-unlimited/declaration-strict-value` for colour, font family, font size, margin, padding, gap and box-shadow; `color-no-hex`; no gradient functions).

- **Type scale:** `--text-label` 11/18rem, `--text-small` 0.84rem, `--text-detail` 0.95rem, `--text-body` 1.02rem (1.22rem wide), `--text-h3` 1.22rem, `--text-h2` 1.5rem, `--text-h1` 1.875rem. Weights `--weight-body` 450, `--weight-strong` 600. Leading `--leading-body` 1.55, `--leading-tight` 1.2. Tracking `--tracking-label` 0.12em.
- **Families:** `--font-serif` (the pick), `--font-serif-brygada`, `--font-serif-newsreader`, `--font-serif-source` (the candidates), `--font-mono`; roles `--font-body`, `--font-display`, `--font-ui`.
- **Spacing scale:** `--space-1` 0.25rem, `--space-2` 0.5rem, `--space-3` 0.75rem, `--space-4` 1rem, `--space-5` 1.5rem, `--space-6` 2rem, `--space-7` 3rem, `--space-8` 4rem; `--measure` 36rem; `--gutter`.
- **Colours:** the table above, plus `--paper-texture`.
- **Borders:** `--border-width` 1px, `--border` (hairline in `--line`), `--border-strong`.
- **Radii:** `--radius-0` 0, `--radius-1` 2px, `--radius-2` 4px. Nothing rounder.
- **Shadow:** `--shadow-focus` only (the focus ring). No drop shadows.
- **Motion:** `--duration-fast` 150ms, `--duration` 400ms, `--ease` ease; colour fades only, and zero under `prefers-reduced-motion`.

## Never

- Tailwind defaults, or any CSS framework or component kit (Tailwind, Bootstrap, Bulma, shadcn, daisyUI; checked by `scripts/check-deps.ts`).
- Gradients (stylelint rejects every gradient function).
- An oversized hero, or a giant centred headline.
- Emoji icons, and stock icon sets.
- Generic card grids, and drop-shadow-heavy cards.
- Purple or indigo accents.
- Pure black text or a pure white background.
- Third-party names, logos or marks on the built site.

## Fonts

All fonts are SIL OFL 1.1, self-hosted from `public/fonts/<family>/` with each family's `OFL.txt` beside it. There is no font CDN at runtime. Sources: the serif candidates from the `google/fonts` GitHub repository (`ofl/<family>/`), Departure Mono 1.500 and Commit Mono 1.143 from their GitHub releases. Each was subset to Latin (Basic Latin, Latin-1, Latin Extended-A and common punctuation) and converted to woff2 with fontTools `pyftsubset`. None has a Reserved Font Name.

Serif candidates, compared on `/_fonts/` (the same CV-like block in each, unlinked from the site) and beside the reference by `scripts/font-compare.ts`:

| Candidate | Why it was a candidate |
|---|---|
| Brygada 1918 | An old-style revival of a 1918 Polish face, contemporary with Plantin (1913): sturdy, warm. |
| Newsreader | Old-style text face for reading on screen: slightly condensed, robust, large x-height. |
| Source Serif 4 | Fournier-style transitional with optical sizes: robust and very legible. |

**The pick: Newsreader** (`--font-serif: var(--font-serif-newsreader)`). The design critic scored all three candidates 90 out of 100 against the reference (claude/sonnet, the calibrated critic), so its score did not separate them; the tie was broken by looking at the candidates beside the reference at 390 and 1280px. Newsreader is the closest to the reference's Plantin: a narrower set width and lighter, even colour on the page, a similar large x-height, and an italic with the same calm, slightly condensed shape for display headings. Brygada 1918 sets noticeably wider and darker; Source Serif 4 is a wider transitional face with a more modern feel. Plantin itself could be bought later.

Swapping fonts is a token change only: point `--font-serif` at another candidate token (or a bought Plantin) in `tokens.css`.

## Attribution

Colour values, type sizes, weights, leading, label tracking and the motion duration marked `(pi)` in `tokens.css` are taken from pi-website (https://github.com/earendil-works/pi-website), the project behind pi.dev, which is under the MIT licence; see `NOTICE`. They were read from the stylesheet pi.dev serves (its light theme), which is newer than the CSS in that repository. Only values are reused, no code structure. The paper texture is this site's own SVG, not pi.dev's CSS.
