# Design critic calibration cases

| Case | Candidate | Expected |
|---|---|---|
| `reference` | The reference screenshots themselves, from `.cache/reference/` (captured at runtime by `scripts/reference-screens.ts`, never committed). | pass |
| `generic-page` | `generic-page.html`: the "Tailwind defaults" look, with a decorative gradient hero, a giant centred headline, a shadowed card grid, emoji icons and indigo/purple. | fail |
| `home` | Control: the real built home page, nothing injected (`home.css` is empty). | pass |
| `near-miss-sans-white` | The real home page with one defect: a system sans-serif body on a pure white page (no paper grid). | fail |
| `near-miss-indigo` | The real home page with one defect: indigo and purple links and accents (with a line of links added to show them). | fail |
| `near-miss-hero-cards` | The real home page with one defect: a 64px headline and a grid of drop-shadowed cards. | fail |

A near miss is `<name>.css`, injected into the built home page before the screenshots, plus an optional `<name>.fragment.html` appended to `main`. The near misses check that the critic discriminates: the real page passes, and one planted defect is enough to fail it.

The critic always sees the reference screenshots beside the candidate. `evals/run.ts` builds the site and takes every case's screenshots once before the cases run. Re-run `npm run eval:calibrate` (with `--repeat 3` for the picked pair) whenever the rubric, the role prompt (`agents/src/design-critic.md`), `DESIGN.md` or a model changes.

No third-party screenshot or branding is committed: the `reference` case reads the uncommitted cache.
