# Privacy audit: axe-core 4.14.0 and @axe-core/playwright 4.14.0

**Verdict: Local only.** axe-core is a script that Playwright injects into the page under test. It checks the DOM in the browser and returns results to the test. It has no telemetry and sends nothing anywhere.

2026-11-22 · profile personal · static review of the published npm tarballs (`npm pack`), not installed with scripts in the audit folder · light review (a grep-led read, not a full jq-privacy-audit run)

## What it does with your data

It reads the DOM of the page the test opened (here, the built site served by `astro preview` on localhost) and returns a list of rule violations. The results stay in the Playwright process.

## Where it connects

| Host | Kind | What is sent | When | Disclosed? | Evidence |
|---|---|---|---|---|---|
| the page's own cross-origin stylesheets | page content | GET for a stylesheet the page links | only when the page links a cross-origin stylesheet (the site links none) | yes, docs (`preload`) | `axe.js`, `parseCrossOriginStylesheet` (`XMLHttpRequest`) |
| dequeuniversity.com | none | nothing: the host only appears in the `helpUrl` text of each result | never fetched | yes | `axe.js`, `helpUrlBase` constant |

## Findings

No telemetry, analytics or error reporting: the only network code is the stylesheet preload above. `@axe-core/playwright` (`dist/index.js`, `dist/index.mjs`) has no network calls; it passes the axe source to `page.evaluate`. Neither package has an install script. The `prepare` script in `@axe-core/playwright` runs only when building from a git checkout, not on install from the registry.

## Coverage

- Read: `package.json` of both packages, `@axe-core/playwright/dist/*`, and the network leads in `axe-core/axe.js` (searched for `XMLHttpRequest`, `fetch(`, `sendBeacon`, `WebSocket` and URL literals).
- Pinned exactly in `package.json` (both packages, so `~4.14.0` cannot resolve a newer `axe-core`).
- Not done: a full jq-privacy-audit run and a sandbox run. What would change the verdict: a future version adding reporting, which the exact pin rules out until someone upgrades it on purpose.
