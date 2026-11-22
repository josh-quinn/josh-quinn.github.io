# Privacy audit: promptfoo 0.126.0 (npm)

**Verdict: Needs your decision.** Everything runs locally, but anonymous telemetry and an update check are on by default, and the telemetry opt-out still sends one content-free event. Once locked down (below) no prompt, output or file content leaves the machine.

2026-11-22 · profile personal · static, plus a scratch-directory run behind a blocking proxy · source npm `promptfoo@0.126.0` (tarball checked against the registry hash), https://github.com/promptfoo/promptfoo

## What it does with your data

It reads a config file, renders prompts, calls the providers you configure (here, a local script that calls `claude -p` or `copilot -p`), grades the results and stores them in a local SQLite database under its config directory. Optional features upload results (`--share`, cloud login) or call promptfoo's hosted services (red-team generation, email verification).

## Where it connects

| Host | Kind | What is sent | When | Disclosed? | Evidence |
|---|---|---|---|---|---|
| api.promptfoo.dev | own service | version check | each run unless `PROMPTFOO_DISABLE_UPDATE` | docs | `dist/src/main.js` `checkForUpdates` |
| a.promptfoo.app | telemetry (PostHog) | user id, event names, OS, Node version, CI flag, login info | each command, default on | docs | `dist/src/telemetry-*.js` |
| r.promptfoo.app | telemetry | same, plus email if one is set | each command; **also when telemetry is disabled** | partly | `telemetry-*.js` `sendEvent` |
| api.promptfoo.dev (consent, share, generation) | own service | only on those features | opt-in features | docs | `PROMPTFOO_DISABLE_SHARING`, `PROMPTFOO_DISABLE_REMOTE_GENERATION` |
| Many AI provider APIs | ai-provider | prompts | only if a provider is configured | docs | `dist/src/providers-*.js` |

Observed through a local proxy that blocked and logged connections (echo provider, no AI): default run connected to `api.promptfoo.dev`, `a.promptfoo.app` and `r.promptfoo.app` (four times). With `PROMPTFOO_DISABLE_TELEMETRY=1`, `PROMPTFOO_DISABLE_UPDATE=1`, `PROMPTFOO_DISABLE_SHARING=1` and `PROMPTFOO_DISABLE_REMOTE_GENERATION=1` it still made one connection to `r.promptfoo.app`.

## What it keeps on this machine

| Where | What | Protection | Synced or shared? |
|---|---|---|---|
| `PROMPTFOO_CONFIG_DIR` (default under the home folder) | eval database, a random user id, optional email | normal file permissions | no |

## Findings

### 1. Telemetry opt-out still sends one event (decide)

`record()` calls `recordTelemetryDisabled()`, which calls `sendEvent`; `sendEvent` posts to `R_ENDPOINT` without checking the disabled flag. The event is `feature_used` with `{feature: "telemetry disabled"}` plus user id, version, CI flag, OS and Node version, and the email if set. No prompts or outputs. Fix: send promptfoo through a dead local proxy (`HTTPS_PROXY=http://127.0.0.1:9`), and unset the proxy inside provider scripts.

### 2. Default-on telemetry and update check (decide)

Disable with the four environment variables above. Keep `PROMPTFOO_CONFIG_DIR` local and never log in or set an email.

### 3. Large dependency tree (note)

577 packages on install; the `prepare` script is `husky || exit 0` and no install scripts exist in the package itself. Install with `--ignore-scripts` (verified to run).

## Your decisions

- [ ] Accept promptfoo with the lock-down above (telemetry env vars, dead-proxy wrapper). The alternative is a small runner in `gate`.

## Coverage

- Read: `package.json`, `telemetry-*.js`, update check in `main.js`, `fetch-*.js` endpoints, scanner's telemetry and own-service leads.
- Not read: `dist/src/main.js` and `dist/src/server/index.js` in full (over 2 MB), the provider modules (not used), the web UI bundle, the 74 dependencies beyond manifest names (posthog-node, OpenTelemetry exporters are present).
- Dynamic check: scratch-directory runs of an echo provider (proxy-logged) and exec providers calling `claude -p` and `copilot -p`. Not a full sandbox run.
- Would change the verdict: a sandbox run of a full eval confirming no other outbound traffic.
