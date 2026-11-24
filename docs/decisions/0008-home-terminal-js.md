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
- built `.js` files exist only under `dist/_astro/`.
