# Privacy audit: stylelint 17.16.0

**Verdict: Local only.** stylelint reads the CSS and `.astro` files it is pointed at and prints lint results. In the code read, it makes no network requests, has no telemetry or error reporting, and has no install script.

2026-11-23 · profile personal · static review of the published npm tarball (fetched with `privacy.py fetch npm`, integrity-checked, not installed in the audit folder) and of its installed dependency tree · jq-privacy-audit run (`scan`, then a read of every lead)

## What it does with your data

It reads the files matched by its glob (here `src/**/*.{css,astro}`) and its config (`.stylelintrc.json`), and writes results to the terminal. It writes files only when asked: a cache file with `--cache`, an output file with `--output-file`, and a suppressions file with `--suppress`. This repo uses none of these.

| Your data | How it gets it | Stays local? | Goes to |
|---|---|---|---|
| Stylesheets and `.astro` files | reads the files the glob matches | yes | the terminal only |

## Where it connects

None. The scan found 23 hosts. All of them are documentation or specification links in rule metadata and comments (`stylelint.io` rule URLs, `drafts.csswg.org`, `developer.mozilla.org`, `www.w3.org`, and similar), or links in the README. None is fetched.

## What it keeps on this machine

| Where | What | When |
|---|---|---|
| `.stylelintcache` (project folder) | file hashes and results | only with `--cache` (not used) |
| `--output-file` / suppressions file | lint results | only with those flags (not used) |

## Findings

### 1. `prepare` script in the manifest (note)

`package.json:62` has `"prepare": "git config set --local core.hooksPath .githooks || true && patch-package"`. npm runs `prepare` only for a git checkout or a local `npm install` inside the package's own folder. It does not run when the package is installed from the registry as a dependency. There are no `preinstall`, `install` or `postinstall` scripts.

### 2. Environment variables read (note)

It reads `NODE_ENV`, `TIMING` and terminal-detection variables (`TERM`, `TERM_PROGRAM`, `WT_SESSION` and others, in `lib/utils/isUnicodeSupported.mjs`) to format output. Nothing is sent.

## Coverage

- Read:
  - `package.json`;
  - every scan lead in `lib/`, `bin/` and `types/`;
  - a search of `lib/` and `bin/` for `http`, `https`, `net`, `tls`, `dgram`, `child_process`, `fetch(`, `XMLHttpRequest`, `WebSocket` and `sendBeacon`, which found none;
  - the file writers `lib/standalone.mjs`, `lib/writeOutputFile.mjs` and `lib/utils/suppressionsService.mjs`.
- Dependencies: the installed tree under stylelint, stylelint-declaration-strict-value and postcss-html (215 packages, from `package-lock.json`). It has no install scripts. A search for network and process modules found three leads, none of which is a network call:
  - `domutils/lib/feeds.js`: `fetch` is a local helper function;
  - `meow/build/dependencies.js`: imports `execFile`, never calls it;
  - `unicorn-magic/node.js`: an `execFile` wrapper, not reached by stylelint's use of `meow`.
- Version pinned exactly (`17.16.0`) in `package.json`. 17.x, not 18, because the plugin `stylelint-declaration-strict-value` 1.12.1 supports stylelint up to 17 (ADR 0007).
- Not done: a sandbox run. What would change the verdict: a future version adding reporting or update checks; the exact pin rules that out until someone upgrades on purpose.
