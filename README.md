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
```

CI runs `build`, `unit` and `e2e` jobs on pull requests and pushes to `main`.
Pushes to `main` deploy to GitHub Pages.

## Gate

Each task runs on a branch `task/<id>-<slug>` and is done when its gate passes.

```sh
npm run gate -- task T1        # run gate.yaml checks on a clean tree, write .gate/T1/
npm run gate -- verify T1      # passing verdict for exactly this tree?
npm run gate -- integrity T1   # tests/acceptance/T1/ unchanged since the test-author commit?
```

Commit `.gate/<id>/verdict.json` and `report.md` (evidence logs stay local). The
`pre-push` hook (lefthook) and the CI `integrity` and `verdict` jobs enforce this on
`task/*` branches, and the CI `verdict` job checks the merge tree, so a branch behind
`main` must be rebased and re-gated. Agent hooks (`tools/gate/guard.ts`, see
`docs/decisions/0004-agent-capabilities.md`) block agent writes to `.gate/` and
`tests/acceptance/`. Start the test-author agent with `GATE_TEST_AUTHOR=<id>` so it can
write `tests/acceptance/<id>/`. The gate needs `gitleaks` and `lychee` on the PATH;
machine defaults live in `~/.config/jq-tools/gate/config.yaml`.

See `NOTICE` for third-party credits.
