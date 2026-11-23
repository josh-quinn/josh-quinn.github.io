# Design critic calibration cases

| Case | Candidate | Expected |
|---|---|---|
| `generic-page` | `generic-page.html`, screenshotted at 390 and 1280px: the "Tailwind defaults" look (gradient hero, giant centred headline, shadowed card grid, emoji icons, indigo/purple). | fail |
| `reference` | The reference screenshots themselves, from `.cache/reference/` (captured at runtime by `scripts/reference-screens.ts`, never committed). | pass |

The critic always sees the reference screenshots beside the candidate. A good critic fails the generic page and passes the reference. Re-run `npm run eval:calibrate` whenever the rubric, the role prompt (`agents/src/design-critic.md`), `DESIGN.md` or a model changes.

No third-party screenshot or branding is committed: the `reference` case reads the uncommitted cache.
