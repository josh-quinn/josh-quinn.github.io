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
```

CI runs `build`, `unit` and `e2e` jobs on pull requests and pushes to `main`.
Pushes to `main` deploy to GitHub Pages.

See `NOTICE` for third-party credits.
