# Quickstart: validate the CV pages

Prerequisites: Node 24 (`.nvmrc`), `npm ci`, Playwright Chromium (`npx playwright install chromium`), Docker for the visual suite, `lychee` and `gitleaks` on `PATH` for the full gate.

## Build and look

```sh
npm run build                 # writes dist/, including dist/cv/** and dist/404.html
npm run preview               # http://localhost:4321/cv/ , /cv/engineering/ , /cv/ocean/ , /cv/life/ , /cv/foo/ (404)
```

## Per gate task

```sh
npm run build && npx playwright test tests/acceptance/CV1/   # module criteria AC-01..AC-10
npm run build && npx playwright test tests/acceptance/CV2/   # view pages + 404, AC-11..AC-20, AC-30..AC-38
npm run build && npx playwright test tests/acceptance/CV3/   # overview, AC-21..AC-24, AC-30..AC-38
npm run build && npx playwright test tests/acceptance/CV4/   # baseline files, AC-50
npm run test:unit                                            # inner unit tests (tests/unit/cv/)
npm run test:visual                                          # AC-51, in the Linux image
npm run gate -- task CV2                                     # the full verdict for one task
```

Expected: each acceptance folder fails before its task's implementation (tests are committed first) and passes after. The gate verdict for the task passes.

## Site-wide checks that cover the new pages automatically

```sh
npm run test:a11y                         # axe on every built page, CV pages and 404 included
npx playwright test tests/privacy/        # privacy patterns on every built HTML file
lychee --offline --no-progress --root-dir "$PWD/dist" dist   # internal links
npm run lint:css                          # tokens only, no gradients outside paper.css
```

## Manual spot checks

- Open `/cv/engineering/` at 390px wide in a browser with JavaScript disabled. The content is identical, and nothing scrolls sideways.
- Turn on "reduce motion" in the OS. Nothing animates.
- Change one entry's `views` in a scratch copy of `resume.json`, rebuild, and see it move between views (SC-007). Do not commit the change.
