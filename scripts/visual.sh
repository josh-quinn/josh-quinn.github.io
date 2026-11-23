#!/bin/sh
# Visual regression suite in the Linux Playwright image that matches the installed
# @playwright/test, so local baselines and CI (ubuntu, same image) render identically.
#
#   npm run test:visual                          compare against tests/visual/__screenshots__/
#   npm run test:visual -- --update-snapshots    write new baselines (review them before committing)
#
# Needs Docker. The container gets its own node_modules (an anonymous volume), so the host's
# macOS binaries are never used inside it, and the host's node_modules are left alone.
set -eu

version=$(node -p "require('@playwright/test/package.json').version")
image="mcr.microsoft.com/playwright:v${version}-noble"

exec docker run --rm --ipc=host \
  -v "$PWD":/work -v /work/node_modules -w /work \
  -e CI="${CI:-}" \
  "$image" \
  sh -c 'npm ci --ignore-scripts --no-audit --no-fund --loglevel=error && npm run build --silent >/dev/null && npx playwright test -c playwright.visual.config.ts "$@"' \
  visual "$@"
