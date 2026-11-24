# Research: CV pages

Phase 0 of `/speckit-plan`. Each decision was checked against the repository as it stands on `slice/08-cv-spec` (Astro 7.4.13, Playwright 1.65, Vitest 5). The Technical Context had no open NEEDS CLARIFICATION items; these notes record the choices behind it.

## R1. Routes: one dynamic view route

- **Decision**: `src/pages/cv/index.astro` for the overview, plus `src/pages/cv/[view].astro` with `getStaticPaths()` returning one path per entry of `VIEWS` from `src/lib/cv.ts`.
- **Rationale**: one template for the three views, so they cannot drift apart. Only the three views are generated, so any other `/cv/<x>/` is not built and falls through to the 404 (AC-18, AC-19). The default `build.format` is `directory`, so the output is `dist/cv/<view>/index.html`.
- **Alternatives**: three near-identical page files (duplication, drift); a catch-all `[...view]` (would generate nothing extra, but invites building unknown paths).

## R2. Unknown views get the site 404

- **Decision**: add `src/pages/404.astro`, built as `dist/404.html`.
- **Rationale**: the site has no 404 page yet. GitHub Pages serves `404.html` with status 404 for any missing path. `astro preview` does the same: in Astro 7.4.13, `vite-plugin-astro-preview.js` replaces Vite's 404 middleware with one that returns `dist/404.html` and status 404. The visual suite's server `scripts/serve-dist.mjs` also returns `404.html` with status 404. So `/cv/foo/` behaves the same under the acceptance tests, the visual suite and production.
- **Alternatives**: redirects or meta refresh to `/cv/` (wrong status, and the brief requires the 404).

## R3. Reading the content

- **Decision**: import `src/content/resume.json` statically in page frontmatter, and pass it to the pure functions in `src/lib/cv.ts`, which carry hand-written TypeScript types for the schema subset they use.
- **Rationale**: the module stays pure and importable from both Vitest and the Playwright runner with no Astro runtime (AC-01 to AC-10). Schema validation already lives in `tests/unit/content/resume.test.ts` (Ajv). Clarify Q4 ruled out new build-time validation.
- **Alternatives**: Astro content collections with a Zod schema (duplicates `resume.schema.json` and ties the selection logic to Astro); a JSON-schema-to-TS generator (a new dependency and ADR for little gain).

## R4. No client JavaScript

- **Decision**: no `client:*` directives, no `<script>` in any component, and no prefetch or view-transition features. The CV pages, CV components and the 404 page contain only markup and CSS.
- **Rationale**: Astro emits no script for static components. The current `dist/index.html` has 0 `<script>` tags. AC-31 checks the built HTML directly, so a regression (for example an integration that injects a script) fails loudly.
- **Alternatives**: none; the constitution forbids client JS on CV pages.

## R5. Where module-level acceptance tests run

- **Decision**: the acceptance tests for CV1 are `tests/acceptance/CV1/*.spec.ts`, run by the Playwright test runner without using a `page`. They import `src/lib/cv.ts` (dynamically, per the spec note). The implementer's inner TDD tests are Vitest files under `tests/unit/cv/`.
- **Rationale**: the gate's `acceptance` check runs only `npx playwright test tests/acceptance/<id>/` and requires `*.spec.ts` files. The existing `tests/privacy/no-private-data.spec.ts` already imports a TS module extensionless from a Playwright spec, so the runner's TS transform handles it. Vitest's `include` (`tests/unit/**/*.test.ts`) does not pick up acceptance specs, so there is no double run.
- **Alternatives**: Vitest acceptance tests (the gate would not run them, and the acceptance check would fail with "no acceptance tests").

## R6. Visual baselines: Linux only, gate-verified

- **Decision**: baselines are made and compared only in the Linux Playwright image (`npm run test:visual`, the gate's `visual` check). Page ids: `cv`, `cv-engineering`, `cv-ocean`, `cv-life`, `404` (route `/cv/foo/`), each at 390 and 1280. AC-50 (the files exist with the right widths) is a host acceptance test. AC-51 (the pixels match) is verified by the gate's `visual` check.
- **Rationale**: host (macOS) renders differ from the Linux baselines. The suite (`playwright.visual.config.ts`) already emulates reduced motion and disables animations, so screenshots are stable.
- **Design-phase handoff** (dependency, see plan): the `/cv/` look and `cv-390.png` / `cv-1280.png` come from the design-first prototype phase, approved by the owner. CV3 adds `/cv/` to `tests/visual/pages.spec.ts` so the gate holds the real page to the approved prototype from CV3 on. CV4 adds the view pages and the 404 page with owner-approved baselines.
- **Alternatives**: host-rendered baselines (they differ between macOS and the Linux CI image, which is why the repo already renders baselines only in Docker).

## R7. Styles

- **Decision**: CV-specific rules in one `src/styles/cv.css`, imported by the CV layout, using only tokens from `src/styles/tokens.css`. Reuse the existing `.label`, `.meta`, `.island`, `.island-bar`, `.island-body`, `.facts`, `.reveal` and `.d1`–`.d6` from `base.css`. No gradients (stylelint allows them only in `paper.css`) and no shadows.
- **Rationale**: stylelint (`scale-unlimited/declaration-strict-value`, `color-no-hex`) already enforces tokens on `src/**/*.{css,astro}`. One file keeps the CV look reviewable and lets the design phase hand over its CSS directly.
- **Alternatives**: scoped `<style>` blocks per component (fine for stylelint, but splits the look across files and makes the design handoff harder).

## R8. Layout fit at 390px

- **Decision**: `overflow-wrap: anywhere` on entry text and links, `min-width: 0` on flex and grid children, and no fixed widths wider than `--measure`. Profile links and the view nav wrap.
- **Rationale**: AC-32 measures `scrollWidth <= clientWidth`. Long URLs, keywords or names are the usual cause of overflow.

## R9. Delivery order and internal links

- **Decision**: CV1 (module), CV2 (view pages and 404), CV3 (overview, plus the `CV overview` back-links on view pages, AC-17), CV4 (visual baselines).
- **Rationale**: the gate's `links` check (lychee, offline, over `dist/`) runs on every gate task. View pages link to each other and to the external profiles only, so CV2 never links to a missing page. The overview, which links to the views, comes after them. The back-link from the views to `/cv/` is added in the same PR that builds `/cv/`. This differs from the controller's suggested order (overview before views) for exactly that reason.
- **Alternatives**: overview first (its view links would fail lychee until the views exist); views and overview in one PR (too large to review as one gate task).

## R10. Hard-coded content guard

- **Decision**: AC-24 scans `src/` (except `src/content/**`, `src/pages/index.astro` and `src/pages/_fonts.astro`) for any rendered value of 8 or more characters. View tags, network names and `meta` are not rendered values (clarify Q1).
- **Rationale**: it makes "pages render whatever is in `resume.json`" checkable. The design prototype, if it hard-codes content, must be gone by the end of CV3.

## R11. Motion and axe

- **Decision**: reuse the existing CSS motion (`.reveal` stagger, `h1` focus-in, island enter), all inside `@media (prefers-reduced-motion: no-preference)`. Axe runs after the finite animations finish, as `tests/a11y/axe.spec.ts` does.
- **Rationale**: AC-33 and AC-34. Entrance animations start at opacity 0, and scanning mid-animation gives false contrast failures.

## R12. Known limits of the gate for this feature

- The task-mode `design-critic` check in `gate.yaml` scores only `--page index`. `ai-eval.ts` maps a page id `x` to `/x/`, so it can score `/cv/` (`gate design cv`) but has no id for the nested view routes. Design conformance of the view pages therefore rests on AC-38, the visual baselines and owner approval. Changing `gate.yaml` or `ai-eval.ts` is out of scope for this feature; it is flagged to the controller.
