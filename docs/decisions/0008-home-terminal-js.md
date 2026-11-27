# 0008. One JavaScript module, for the home-page terminal only

Status: accepted (2026-11-24). Owner decision, confirmed directly ("Yes, home terminal only").

## Context

The constitution (IV) forbade client-side JavaScript on CV pages, and `DESIGN.md` went further: no client JavaScript on any page. The home page shows a terminal in a sticky media island. As CSS alone it can only play a scripted demo: a visitor cannot type into it. The owner wants the home terminal to be interactive, and wants everything else to stay as it is.

## Options

1. **CSS-only everywhere (status quo).** No JS risk, but the terminal can never accept input.
2. **JavaScript across the site.** Flexible, but it gives up the "static, no-JS, nothing to audit" property, and puts script on the CV pages that the constitution protects.
3. **CSS-only by default, one JS module on the home page only.** The terminal is a CSS-only scroll-driven demo. Clicking it, or pressing Enter on it, swaps in a small self-contained mock terminal with canned output. Every other page stays JS-free.

## Decision

Option 3.

- The home page (`/`) may ship at most one first-party `<script type="module">`, for the terminal.
- The module has no dependencies, makes no network calls, uses no `eval`, and never writes input into the page with `innerHTML` (output is canned text set through `textContent` or cloned from templates).
- The CSS or static demo is the default and the no-JS fallback. The page is complete without JS.
- The terminal is accessible: a labelled input, `aria-live` output, and no keyboard trap (Escape or Tab leaves it).
- Motion stays CSS-only and respects `prefers-reduced-motion`. JS handles input and output only.
- CV pages (`/cv/` and everything under it) and every other page ship no JavaScript.

## Consequences

- The constitution (IV) gains a scoped exception and moves to 1.1.0. `DESIGN.md` (Components, Motion, Never) is updated to match.
- The home page now has one script to review. Content-Security-Policy and the privacy rules are unchanged: the script is first-party, offline and holds no personal data.
- Any further JS, on any page, needs a new ADR that supersedes this one.

## Enforcement

`tests/smoke/design.spec.ts`, run by the CI `e2e` job (`npm run test:e2e`, after `npm run build`), inspects the built `dist/` HTML in a real DOM (a Playwright context with JavaScript disabled, not a regex):

- every page except `dist/index.html` has no `<script>` element;
- no page has an attribute whose name starts with `on`, a `javascript:` URL in `href`, `action`, `formaction` or `src`, or an `iframe[srcdoc]`;
- `dist/index.html` has at most one `<script>`, which is `type="module"` and either inline or with a first-party `src` (no scheme, no `//` prefix);
- the scan also covers `<template>` contents, any attribute holding a `javascript:` URL (after the browser's tab/CR/LF and leading-control stripping), and `<base href>` pointing off-site; an inline home module may not contain `http(s):`, a `//` import or a dynamic `import()`;
- built `.js` files exist only under `dist/_astro/`.

## Amendment 1 (2026-11-27): the script may control the demo loops

Owner feedback after trying the terminal (ruling R55): the demos should be loops that restart for each section, not typing scrubbed by the scroll position.

- **The module is also the demo controller.** It picks the active section with an IntersectionObserver (the section most in view). It restarts that section's loop from the start by re-adding a class (`.is-playing`), and it pauses or resumes the loop with `animation-play-state` (`.is-paused`).
- **The loops stay CSS.** Each loop is a time-based keyframe animation with `steps()`: an integer clock (`@property --tick`) on the pane's screen, from which every part of the demo works out whether it is shown. JS never animates frame by frame and never maps the scroll position to a frame. No demo uses a scroll or view timeline.
- **What JS shows.** In story mode (motion allowed, 64rem and up) the script also chooses which pane is shown (`.is-active`). Without JS the panes never stack: each shows its final frame beside its own chapter.
- **Everything else in this ADR is unchanged.** There is still one first-party module on the home page only, with no dependencies, no network, no `eval` and no `innerHTML` with input. The page is complete without JS. Under reduced motion nothing loops and every pane shows its final frame.
- **Enforcement.**
  - `tests/smoke/design.spec.ts` is unchanged in its JS-policy block.
  - `tests/smoke/terminal.spec.ts` checks that no part of a demo runs on a scroll or view timeline.
  - `tests/e2e/terminal-loop.spec.ts` checks that a loop restarts on re-entry, is not scrubbed by scrolling, and pauses in place.
