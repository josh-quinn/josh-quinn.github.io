# josh-quinn.github.io

Source for my personal site, a static [Astro](https://astro.build) site
published with GitHub Pages at https://josh-quinn.github.io.

## Requirements

Node 24 (see `.nvmrc`), for example `nvm use` or `fnm use`.

## Commands

```sh
npm ci                 # install
npx playwright install chromium   # once, for e2e tests
npm run build          # static build into dist/
npm run lint           # astro check
npm run test:unit      # Vitest
npm run test:e2e       # Playwright against `astro preview` (build first)
npm run test:a11y      # axe on every built page (also part of test:e2e)
npm run lint:css       # stylelint: colour, font and spacing only from tokens
npm run deps           # no CSS framework or component kit in the dependencies
npm run test:visual    # visual baselines, in the Linux Playwright image (needs Docker)
```

The design system is `DESIGN.md` (tokens in `src/styles/tokens.css`). The AI design critic and
auditor, and their calibration, are in `evals/` (see `evals/README.md`).

CI runs `build`, `unit`, `stylelint`, `deps`, `visual`, `e2e` and `privacy` jobs on pull
requests and pushes to `main`.
Pushes to `main` deploy to GitHub Pages.

## Gate

Each task runs on a branch `task/<id>-<slug>` and is done when its gate passes.

```sh
npm run gate -- task T1        # run gate.yaml checks on a clean tree, write .gate/T1/
npm run gate -- verify T1      # passing verdict for exactly this tree?
npm run gate -- integrity T1   # tests first, and unchanged since the test-author commit?
```

The first commit on a task branch is the test author's, the only one with the trailer
`Gate-Test-Author: <id>`, and it touches only `tests/acceptance/<id>/`. Commit
`.gate/<id>/verdict.json` and `report.md` (evidence logs stay local). The `pre-push` hook
(lefthook) checks every pushed `task/*` branch for a passing verdict for the pushed
commit. The CI `integrity` and `verdict` jobs enforce the same on pull requests. The
`verdict` job checks the merge tree, so a branch behind `main` must be rebased and
re-gated. A pull request from any other branch fails if it changes `tests/acceptance/`
or `.gate/`. Agent hooks (`tools/gate/guard.ts`, see
`docs/decisions/0004-agent-capabilities.md`) block agent writes to `.gate/` and
`tests/acceptance/`. Start the test-author agent with `GATE_TEST_AUTHOR=<id>` so it can
write `tests/acceptance/<id>/`. The gate needs `gitleaks` and `lychee` on the PATH;
machine defaults live in `~/.config/jq-tools/gate/config.yaml`.

See `NOTICE` for third-party credits.
