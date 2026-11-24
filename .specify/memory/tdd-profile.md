---
detected_at: 28afd33
ecosystems: [typescript]
default: typescript
stacks:
  typescript:
    cwd: .
    runner: vitest (unit), playwright (acceptance, a11y, privacy, smoke)
    single: null # vitest -t with no match exits 0 (all skipped); see Notes. Playwright -g is verified below.
    file: npx vitest run {file}
    suite: npm run test:unit && npm run build && npx playwright test
    watch: null # not started during setup
    coverage: null # @vitest/coverage-v8 is not installed
    mutation: null # no mutation tool in package-lock.json
    acceptance: 'npx playwright test {file} -g "{name}"'
    property: null # no property-based library in package-lock.json
    approval: playwright toHaveScreenshot (tests/visual/, Linux image only via npm run test:visual)
    contract: null
    test_glob: "tests/unit/**/*.test.ts, tests/**/*.spec.ts (Playwright; tests/visual/** excluded from the default config)"
    exemplar:
      unit: tests/unit/privacy/patterns.test.ts
      acceptance: tests/smoke/home.spec.ts
      build-output: tests/privacy/no-private-data.spec.ts
      a11y: tests/a11y/axe.spec.ts
      visual: tests/visual/pages.spec.ts
    helpers:
      - tests/helpers/dist.ts
      - tests/privacy/patterns.ts
      - playwright.config.ts
      - vitest.config.ts
verified: [file, suite, acceptance]
suite_baseline: green
suite_seconds: 17
---

# TDD Stack Profile

## Conventions to match

- **Unit tests** are Vitest files under `tests/unit/<area>/<name>.test.ts` (`vitest.config.ts` also includes `src/**/*.test.ts`, but none exist). They use `describe`/`it`/`expect` from `vitest` and plain objects built in the test. There is no mocking library beyond Vitest's own, and no setup files. Exemplar: `tests/unit/privacy/patterns.test.ts`. It also shows the repo rule that fake personal data is assembled at runtime (`['someone', 'example.com'].join('@')`), never written as a literal.
- **Acceptance tests** are Playwright specs (`*.spec.ts`) under `tests/acceptance/<task-id>/`. The gate's `acceptance` check runs `npx playwright test tests/acceptance/<id>/`. `playwright.config.ts` serves the built `dist/` with `astro preview` on port 4321 (`baseURL` `http://localhost:4321`, Chromium only), so `npm run build` must run first. Exemplar for a browser check: `tests/smoke/home.spec.ts`. Exemplar for a build-output check (reading `dist/` files without a page): `tests/privacy/no-private-data.spec.ts`.
- **Accessibility**: `tests/a11y/axe.spec.ts` shows the house pattern. It waits for finite animations (`document.getAnimations()` with non-infinite iterations) before `new AxeBuilder({ page }).analyze()`, then asserts the violation summary equals `[]`.
- **Helpers to reuse**:
  - `tests/helpers/dist.ts`: `distDir`, `htmlFiles(dir)` (every built `.html`), `urlPathOf(file)` (built file → URL path).
  - `tests/privacy/patterns.ts`: `PRIVATE_PATTERNS`, `loadForbiddenTerms()`, `findPrivateData()` and `assertNoPrivateData(html)`. Errors name patterns, never matched values.
- **Visual** baselines: `tests/visual/pages.spec.ts` with `playwright.visual.config.ts` (reduced motion, animations disabled, `maxDiffPixelRatio` 0.002). They run only in the Linux Playwright image (`npm run test:visual`, Docker). Never compare them on the host.

## Notes and constraints

- **Baseline**: green at `28afd33`. `npm run test:unit`: 18 files, 370 tests passed, about 12 s. `npx playwright test` (a11y, privacy, smoke): 13 passed, about 5 s, against an existing `dist/`. The full suite takes about 17 s plus a build, so a full run per cycle is fine.
- **Single test (unit)**: `npx vitest run {file} -t "{name}"` ran exactly the named test (`1 passed | 6 skipped`). With a name that matches nothing it still exits 0 (`7 skipped`, nothing run), so it fails the "zero tests is not success" check and is recorded as `single: null`. The loop runs whole unit files with `file`. If it does use `-t` for speed, it must read the count line and treat "0 passed, 0 failed" as no match.
- **Single test (acceptance)**: `npx playwright test {file} -g "{name}"` ran exactly the named test (exit 0). With a name that matches nothing it exits 1 ("No tests found"). Verified both ways.
- **Coverage**: `npx vitest run --coverage` fails with "Cannot find dependency '@vitest/coverage-v8'". The audit falls back to trace checking (every AC maps to a named test). The Vitest default would be `@vitest/coverage-v8`. Not added: adding a dependency is the owner's decision.
- **Mutation**: no tool installed. The ecosystem default is StrykerJS. `/speckit-tdd-verify` must use deliberate mutants on the highest-risk behaviors instead.
- **Property-based**: none installed (fast-check is the default). Invariants are sampled with examples at the boundaries.
- Unit tests that touch config set `TOOLS_CONFIG` to a temp dir, so the suite never touches the real `~/.config/jq-tools/`.
- Acceptance and implementer roles: tests under `tests/acceptance/**` are written only by the `test-author` role and are edit-guarded for the implementer (constitution II). The inner unit tests are the implementer's.
- Not checked: watch mode (`npx vitest`) was not started, so it is recorded as `null`. The visual suite was not run here (it needs Docker).
