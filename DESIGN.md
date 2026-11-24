# DESIGN.md

The design system for this site. It is the only authority on type, colour, spacing and layout: `src/styles/tokens.css` mirrors the tokens below, stylelint enforces them, and the design critic (`evals/design-critic/`) scores pages against this file. Change this file and `tokens.css` together.

## References

- **Primary: pi.dev**, in its light theme. The model for type, colour, technical-paper texture, islands, motion and density. It sets an old-style serif in slate ink on warm engineering-grid paper, with small mono labels, hairline-bordered panels ("islands"), gentle entrance motion, and nothing loud.
- **Secondary: lefos.com.** Visual reference only (no values are taken from it): italic serif display headings and calm, compact text blocks.

Reference screenshots are captured at runtime into the uncommitted `.cache/reference/` by `scripts/reference-screens.ts` (at most once a day; the cached copy is used, with a note, when the site is unreachable). No third-party screenshot, logo, name or mark is ever committed or shown on the built site.

## Character

Compact, tidy and quiet, on technical paper. Text blocks are neat and justified-feeling, headers are modest, and the page reads like a well-set engineering notebook, not a landing page. The opposite of "big headers, fonts, pictures and boxes".

## Type

- **Body and headings: one old-style serif** with the feel of the Plantin family (robust, slightly condensed, large x-height). This site uses a free (OFL) serif chosen from a side-by-side comparison (see "Fonts"). Body weight is a touch above regular (450).
- **Display headings: the same serif, in italic**, as on lefos.com. `h1` and `h2` are italic; `h3` is upright semibold. Headings stay modest: `h1` is 1.875rem (about 34px), about 1.9 times the body size.
- **UI, labels, metadata and terminal-style boxes: Departure Mono**, falling back to Commit Mono, then the system mono. Labels are 11px, uppercase, tracked at 0.12em.
- Root size 18px. **Body 1rem (18px) at every width**: normal paragraph text stays a comfortable reading size, not a display size. Line height 1.55. Paragraphs are justified with hyphenation from 48rem up, and ragged-right on narrow screens (justifying a short line opens rivers). `text-wrap: pretty` on body text, `balance` on headings.

## Colour

Light only for now. Warm paper, slate ink, one restrained accent.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#ebe7e4` | page background |
| `--paper-deep` | `#dacbc2` | deeper paper, rare fills |
| `--paper-raised` | `#f3f2f0` | island surface |
| `--paper-cool` | `#eef1f3` | terminal island body |
| `--ink` | `rgba(37,47,61,.96)` (`#252f3df5`) | body text and headings: slate, never black |
| `--ink-soft` | `#384251dc` | secondary copy |
| `--muted` | `#5c5752` | labels, metadata |
| `--link` / `--accent` | `rgb(75,96,124)` (`#4b607c`) | links and the one accent |
| `--accent-warm` | `#844f3b` | very sparing warm accent; never large areas |
| `--line` / `--line-strong` | `#8b847d59` / `#5c57528c` | hairlines, underlines |
| `--selection`, `--focus-ring` | `#4b607c24`, `#4b607c80` | selection and focus |

## Paper

The page sits on technical paper: an engineering grid on warm paper, fixed behind the content (`src/styles/paper.css`).

- **`body::before`** draws the grid:
  - a 20px major cell (`--grid-cell`) in `--grid-major` (`#252f3d12`);
  - minor 1px lines every cell/5 (4px) in `--grid-minor` (`#252f3d08`);
  - a small cross mark at each major intersection in `--grid-cross` (`#252f3d1d`).
- **`body::after`** is the vignette. It has three parts:
  - a paper wash from the top (`--paper-top-wash`, `#ebe7e48c`) that makes the grid noticeably lighter across the top half of the screen, reaching full strength by mid-screen;
  - a soft wash at the edges (`--paper-vignette`, `#ebe7e426`);
  - a fade (`--paper-fade`) that lets the grid fade out towards the bottom of the screen.
- Both layers are drawn with CSS gradients. These are *structural* gradients (lines, marks, a fade), and `paper.css` is the only file stylelint allows them in. Decorative colour gradients are on the never list.

Contrast: `--ink`, `--muted` and `--link` all meet WCAG AA for body text on `--paper` (checked by axe on every built page).

## Layout

- One narrow column, `--measure` 34rem (about 70 characters), centred, with `--gutter` side padding (1rem, 2rem from 48rem up).
- Pages with a nav bar or a split use the wide container (`.page-wide`, `--measure-wide` 60rem). Text inside it keeps `--measure` (`.measure`), left-aligned.
- **Split** (`.split`): from 64rem (1024px) up, two columns: a media island on the left (`.split-media`, sticky) and a column of prose sections on the right (`.split-prose`, `--measure` wide, italic section headings at `--text-section`). Below 64rem it stacks into one column, media first.
- Compact vertical rhythm from the spacing scale; sections separated by a hairline and `--space-7`, not by boxes.
- Modest headers: a mono label, then a small italic heading. No hero.
- Lists are plain.

## Islands

Islands are panels that sit on the grid, like the terminal and preview panels on the reference:

- a raised paper surface (`--paper-raised`), a hairline border (`--border`), a 4px radius (`--radius-2`), and **no drop shadow**;
- an optional bar at the top with a mono label, separated by a hairline;
- an optional caption strip at the bottom (`.island-foot`) with a mono label, separated by a hairline;
- a terminal island (`.terminal`) has a cool panel body (`--paper-cool`), mono text and a blinking block cursor.

Use them for small, self-contained things (a terminal snippet, a set of facts), one or two to a page, never as a grid of cards.

## Components

All in `src/styles/components.css`: CSS only, tokens only, no client JS.

- **Announcement bar** (`.announce`, an `aside` first in `body`): a thin full-width strip at the very top, on `--paper-cool` over a hairline, with one short centred italic serif line at `--text-detail`. At most one per page.
- **Mono nav bar** (`header.navbar`): the site's links set directly on the paper, with a hairline underneath. The first link (`.navbar-brand`) is the site name; other links sit in a `ul`. All are Departure Mono, uppercase, at `--text-label`, tracked `--tracking-label`, not underlined, in `--ink-soft` (`--ink` for the brand, on hover and for `aria-current="page"`). It links only to pages that exist in the build.
- **Bracket link** (`a.bracket`): `[ LIKE THIS ]`. Mono, uppercase, tracked, on a faint raised fill (`--paper-raised`) with a hairline border and a 2px radius, no shadow. The brackets are generated content with empty alt text, so they are not part of the link's accessible name. Hover and `aria-current="page"` darken the text and the border.
- **Split with a sticky media island**: see "Layout". The media island usually has a bar on top, a terminal body and a caption strip at the bottom.
- **Typed line** (`.typed`, with `--chars` set to its length): a terminal command types itself once, then its output (`.typed-out`) appears. At rest, and under reduced motion, it is plain text.

## Motion

CSS only: no client JavaScript on any page (CV pages forbid it, and the rest of the site follows). Every animation is declared inside `@media (prefers-reduced-motion: no-preference)`, so with reduced motion nothing moves.

- **Rise and fade:** `.reveal` lines (opening label, paragraph, metadata) fade in and rise by `--rise` (6px), staggered by `--stagger` (90ms) through `.d1`-`.d6`.
- **Focus-in:** the `h1` comes into focus from a slight blur.
- **Panel enter:** islands fade in and settle (a small rise and scale).
- **Cursor:** the terminal cursor blinks (`--blink` 1.1s, stepped).
- **Typed line:** a `.typed` terminal command types itself once (`--duration-type` 1.2s, one step per character) after the panel enters; its `.typed-out` output then appears.
- Durations: `--duration-enter` 700ms with `--ease-out`; `--duration-fast` 150ms for colour fades on links.

## Tokens

All in `src/styles/tokens.css`. Components use only these (stylelint: `scale-unlimited/declaration-strict-value` for colour, font family, font size, margin, padding, gap and box-shadow; `color-no-hex`; gradient functions only in `paper.css`). See ADR 0007.

- **Type scale:** `--text-label` 11/18rem, `--text-small` 0.84rem, `--text-detail` 0.95rem, `--text-body` 1rem, `--text-h3` 1.22rem, `--text-h2` 1.5rem, `--text-h1` 1.875rem, `--text-section` = `--text-h1` (split section headings; never larger than the page `h1`). Weights `--weight-body` 450, `--weight-strong` 600. Leading `--leading-body` 1.55, `--leading-tight` 1.2. Tracking `--tracking-label` 0.12em.
- **Families:** `--font-serif` (the pick), `--font-serif-brygada`, `--font-serif-newsreader`, `--font-serif-source` (the candidates), `--font-mono`; roles `--font-body`, `--font-display`, `--font-ui`.
- **Spacing scale:** `--space-1` 0.25rem, `--space-2` 0.5rem, `--space-3` 0.75rem, `--space-4` 1rem, `--space-5` 1.5rem, `--space-6` 2rem, `--space-7` 3rem, `--space-8` 4rem; `--measure` 34rem; `--measure-wide` 60rem; `--gutter`.
- **Colours:** the table above. **Paper:** `--grid-cell` 20px, `--grid-minor-step`, `--grid-cross-arm`, `--grid-minor`, `--grid-major`, `--grid-cross`, `--paper-vignette`, `--paper-top-wash` and `--paper-fade`.
- **Borders:** `--border-width` 1px, `--border` (hairline in `--line`), `--border-strong`.
- **Radii:** `--radius-0` 0, `--radius-1` 2px, `--radius-2` 4px. Nothing rounder.
- **Shadow (this site's rule):** `--shadow-focus` only (the focus ring). This site's pages use **no drop shadows**: islands and panels are separated by hairline borders, never by shadows. How the design critic scores a shadow on a candidate page is set in `evals/design-critic/rubric.md`.
- **Motion:** `--duration-fast` 150ms, `--duration` 400ms, `--duration-enter` 700ms, `--stagger` 90ms, `--rise` 6px, `--blink` 1.1s, `--duration-type` 1.2s, `--ease`, `--ease-out`. Nothing animates under `prefers-reduced-motion: reduce`.

## Never

- Tailwind defaults, or any CSS framework or component kit (Tailwind, Bootstrap, Bulma, shadcn, daisyUI; checked by `scripts/check-deps.ts`).
- Decorative colour gradients: gradient heroes, buttons, text or fills. Structural gradients that draw the paper grid and vignette (`paper.css`) are the only exception, and stylelint allows gradient functions nowhere else.
- An oversized hero, or a giant centred headline.
- Emoji icons, and stock icon sets.
- Generic card grids, and, on this site's pages, drop shadows on cards or panels (see "Shadow").
- Client-side JavaScript, including for motion.
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

## Credits

pi.dev is the visual reference for this design. The colour and size values marked `(ref)` in `tokens.css` were observed on pi.dev's public stylesheet (light theme). They include the paper, ink, link and grid colours, the 18px root, the label size and tracking, the body weight and leading, and one motion duration. That stylesheet is not published under a licence, so nothing from it is copied as code. The values are reused only as plain colour and size facts. Every rule, technique and file in `src/styles/` is this site's own, including the grid (drawn with conic and linear gradients of our own), the islands and the motion. No third-party name, logo or mark appears on the built site. See `NOTICE`.
