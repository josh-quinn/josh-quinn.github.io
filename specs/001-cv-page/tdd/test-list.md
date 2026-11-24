---
feature: 001-cv-page
loop: outside-in
profile: .specify/memory/tdd-profile.md
spec_criteria: 36
planned_at: 28afd33
updated_at: b145877
suite_baseline: green
---

# Test List: CV pages

Derived from `spec.md` (acceptance criteria AC-01 to AC-24, AC-30 to AC-39, AC-50, AC-51) and `plan.md`. The outer loop is written by the `test-author` role into `tests/acceptance/<gate-task>/` and committed failing before any implementation (constitution I). The inner loop is the implementer's, test-first, in `tests/unit/cv/`. Gate-task ownership follows spec §Delivery Slices; see [gate-tasks.md](../gate-tasks.md).

The cross-cutting criteria AC-30 to AC-39 apply to two route sets, owned by two gate tasks, so each gets two acceptance behaviors: A25–A33 and A45 for CV2's routes, A34–A42 and A46 for CV3's. A45 and A46 (AC-39, the home link) were appended in fix round 1, and existing ids are unchanged. A24 (AC-24) is expected green on arrival in CV3, because CV1 and CV2 add no content values to `src/`. The test author records that instead of forcing a red. It turns red only if a hard-coded design prototype is on `main`.

## Outer loop: acceptance behaviors

| id | behavior | traces | kind | state | test |
| --- | --- | --- | --- | --- | --- |
| A1 | `VIEWS` and `SECTION_ORDER` equal the contract arrays, in order | AC-01 | example | PENDING | `tests/acceptance/CV1/` |
| A2 | `sectionsForView` equals the expected sections for every view, for a runtime fixture and for the content file | AC-02, FR-002 | example | PENDING | `tests/acceptance/CV1/` |
| A3 | Returned section keys follow section order and none has empty `entries` | AC-03 | example | PENDING | `tests/acceptance/CV1/` |
| A4 | A multi-view entry is in each tagged view's result exactly once and in no other | AC-04 | example | PENDING | `tests/acceptance/CV1/` |
| A5 | A skill without `views` is in no view; a skill tagged `ocean` is in `ocean` only | AC-05 | example | PENDING | `tests/acceptance/CV1/` |
| A6 | `overviewSections` returns only `skills`, with every skill in order, or `[]` when there are none | AC-06, FR-004 | example | PENDING | `tests/acceptance/CV1/` |
| A7 | Content with only `basics`, or with absent section keys, gives `[]` or the same result as empty arrays, without throwing | AC-07 | example | PENDING | `tests/acceptance/CV1/` |
| A8 | `isView` accepts exactly the three names; `sectionsForView(…, 'foo')` throws `Error` | AC-08 | example | PENDING | `tests/acceptance/CV1/` |
| A9 | Neither section function mutates its input; returned entries deep-equal their sources | AC-09 | example | PENDING | `tests/acceptance/CV1/` |
| A10 | `entryTitle` returns the primary field for each of the eight sections | AC-10 | example | PENDING | `tests/acceptance/CV1/` |
| A11 | Each view route responds 200 with a single `h1` equal to its view title | AC-11 | example | PENDING | `tests/acceptance/CV2/` |
| A12 | Each view route's sections and entry `h3`s equal the expected sections for that view, in order, with no extra entries | AC-12, FR-002 | example | PENDING | `tests/acceptance/CV2/` |
| A13 | Each shown section on a view has an `h2` with its heading text | AC-13 | example | PENDING | `tests/acceptance/CV2/` |
| A14 | Each entry's text contains every present shown field, and each highlight or keyword is its own `li` | AC-14, FR-003 | example | PENDING | `tests/acceptance/CV2/` |
| A15 | Each view shows `basics.name` and `basics.label` and not `basics.summary` | AC-15, FR-005 | example | PENDING | `tests/acceptance/CV2/` |
| A16 | Each view's `CV views` nav has three links in view order, only the current one `aria-current="page"` | AC-16, FR-005 | example | PENDING | `tests/acceptance/CV2/` |
| A17 | Each view has a `CV overview` link to `/cv/` | AC-17, FR-005 | example | PENDING | `tests/acceptance/CV3/` |
| A18 | `dist/404.html` exists and `dist/cv/` holds no HTML beyond the four CV pages | AC-18, FR-008 | example | PENDING | `tests/acceptance/CV2/` |
| A19 | `/cv/foo/`, `/cv/foo`, `/cv/engineering/extra/` and `/no-such-page/` respond 404 with the `Page not found` page linking to `/` | AC-19, FR-008 | example | PENDING | `tests/acceptance/CV2/` |
| A20 | The `data-cv-empty` line is present exactly when a view's expected sections are empty | AC-20 | example | PENDING | `tests/acceptance/CV2/` |
| A21 | `/cv/` responds 200 with `h1` = `basics.name`, and shows label, summary and region | AC-21, FR-004 | example | PENDING | `tests/acceptance/CV3/` |
| A22 | `/cv/`'s `CV views` nav has three links in order, none current, each reaching its view | AC-22, FR-004 | example | PENDING | `tests/acceptance/CV3/` |
| A23 | `/cv/` has only the `skills` section, listing every skill name and keyword in order | AC-23, FR-004 | example | PENDING | `tests/acceptance/CV3/` |
| A24 | No `src/` file outside the allowed ones contains a rendered value of 8+ characters | AC-24, FR-001 | example | PENDING | `tests/acceptance/CV3/` |
| A25 | CV2 routes (views and 404): built HTML passes `assertNoPrivateData`; rendered text has no year | AC-30, FR-010 | example | PENDING | `tests/acceptance/CV2/` |
| A26 | CV2 routes: no `<script`, no `on*` attribute, no `javascript:`, `document.scripts.length` 0 | AC-31, FR-009 | example | PENDING | `tests/acceptance/CV2/` |
| A27 | CV2 routes: no horizontal overflow at 390×844 | AC-32, FR-011 | example | PENDING | `tests/acceptance/CV2/` |
| A28 | CV2 routes: zero axe violations after finite animations | AC-33, FR-012 | example | PENDING | `tests/acceptance/CV2/` |
| A29 | CV2 routes: no running animations under reduced motion | AC-34, FR-011 | example | PENDING | `tests/acceptance/CV2/` |
| A30 | CV2 routes: off-site links are exactly the allowed profiles (none on 404); no `mailto:`/`tel:` | AC-35, FR-006 | example | PENDING | `tests/acceptance/CV2/` |
| A31 | CV2 routes: one mono `Sample content` notice before the `h1` on views when placeholder; none on 404 | AC-36, FR-007 | example | PENDING | `tests/acceptance/CV2/` |
| A32 | CV2 routes: `lang="en"`, non-empty distinct titles containing the name (404: `Page not found`), meta description | AC-37 | example | PENDING | `tests/acceptance/CV2/` |
| A33 | CV2 routes: 18px body, italic `h1`/`h2`, grid paper present, at most two islands | AC-38, FR-011 | example | PENDING | `tests/acceptance/CV2/` |
| A34 | `/cv/`: built HTML passes `assertNoPrivateData`; rendered text has no year | AC-30, FR-010 | example | PENDING | `tests/acceptance/CV3/` |
| A35 | `/cv/`: no `<script`, no `on*` attribute, no `javascript:`, `document.scripts.length` 0 | AC-31, FR-009 | example | PENDING | `tests/acceptance/CV3/` |
| A36 | `/cv/`: no horizontal overflow at 390×844 | AC-32, FR-011 | example | PENDING | `tests/acceptance/CV3/` |
| A37 | `/cv/`: zero axe violations after finite animations | AC-33, FR-012 | example | PENDING | `tests/acceptance/CV3/` |
| A38 | `/cv/`: no running animations under reduced motion | AC-34, FR-011 | example | PENDING | `tests/acceptance/CV3/` |
| A39 | `/cv/`: off-site links are exactly the allowed profiles; no `mailto:`/`tel:` | AC-35, FR-006 | example | PENDING | `tests/acceptance/CV3/` |
| A40 | `/cv/`: one mono `Sample content` notice before the `h1` when placeholder | AC-36, FR-007 | example | PENDING | `tests/acceptance/CV3/` |
| A41 | `/cv/`: `lang="en"`, non-empty title containing the name and distinct from the view titles, meta description | AC-37 | example | PENDING | `tests/acceptance/CV3/` |
| A42 | `/cv/`: 18px body, italic `h1`/`h2`, grid paper present, one or two islands | AC-38, FR-011 | example | PENDING | `tests/acceptance/CV3/` |
| A43 | For `cv`, `cv-engineering`, `cv-ocean`, `cv-life` and `404` at 390 and 1280, the baseline PNG exists with that header width, and the visual suite's `--list` output has `<id> at <width>px matches its baseline` | AC-50, FR-013 | example | PENDING | `tests/acceptance/CV4/` |
| A44 | The visual suite matches every AC-50 route at both widths in the Linux image (owned by CV4; CV3's T030 only prepares `/cv/`) | AC-51, FR-013 | approval | PENDING | `tests/visual/pages.spec.ts` (gate `visual` check) |
| A45 | CV2 view routes: a `header` before the `h1` holds exactly one link, to `/`, with text `basics.name` | AC-39, FR-015 | example | PENDING | `tests/acceptance/CV2/` |
| A46 | `/cv/`: a `header` before the `h1` holds exactly one link, to `/`, with text `basics.name` | AC-39, FR-015 | example | PENDING | `tests/acceptance/CV3/` |

## Inner loop: unit behaviors

### `src/lib/cv.ts` (CV1)

| id | behavior | traces | kind | state | test |
| --- | --- | --- | --- | --- | --- |
| U1 | `VIEWS` is `engineering`, `ocean`, `life` in that order | AC-01 | example | PENDING | `tests/unit/cv/constants.test.ts` |
| U2 | `SECTION_ORDER` is the eight keys in spec order | AC-01 | example | PENDING | `tests/unit/cv/constants.test.ts` |
| U3 | `isView` is true for each of the three view names | AC-08 | example | PENDING | `tests/unit/cv/constants.test.ts` |
| U4 | `isView` is false for `Engineering`, `engineering/`, `''`, `cv` and `foo` (case and suffix boundaries) | AC-08 | example | PENDING | `tests/unit/cv/constants.test.ts` |
| U5 | `VIEW_TITLES` maps each view to `Engineering`, `Ocean`, `Life` | AC-11, AC-16 | example | PENDING | `tests/unit/cv/constants.test.ts` |
| U6 | `SECTION_HEADINGS` gives the spec heading per key, `volunteer` → `Volunteering` | AC-13 | example | PENDING | `tests/unit/cv/constants.test.ts` |
| U7 | `viewPath(view)` is `/cv/<view>/` with the trailing slash | AC-16, AC-22 | example | PENDING | `tests/unit/cv/constants.test.ts` |
| U8 | `entryTitle` returns the primary field for each of the eight sections | AC-10 | example | PENDING | `tests/unit/cv/entry-title.test.ts` |
| U9 | An entry tagged for the view is returned | AC-02 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U10 | An entry tagged only for other views is not returned | AC-02 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U11 | Entries keep content-file order within a section | AC-02 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U12 | Sections come out in `SECTION_ORDER` whatever the key order of the input object | AC-03 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U13 | A section with zero tagged entries is omitted | AC-03 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U14 | A section with exactly one tagged entry is kept (other side of U13) | AC-03 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U15 | An entry tagged for two views appears once in each | AC-04 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U16 | A skill without `views` appears in no view | AC-05 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U17 | A skill with `views: ['ocean']` appears in `ocean` only | AC-05 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U18 | An absent section key behaves like `[]` | AC-07 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U19 | Content with only `basics` returns `[]` for every view without throwing | AC-07 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U20 | A non-view value throws an `Error` whose message names the value | AC-08 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U21 | The input is deep-equal to a pre-call copy afterwards | AC-09 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U22 | Returned entries are deep-equal to their source entries | AC-09 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |
| U23 | `overviewSections` returns every skill, with and without `views`, in order | AC-06 | example | PENDING | `tests/unit/cv/overview-sections.test.ts` |
| U24 | `overviewSections` returns `[]` for absent or empty `skills`, and one item for a single skill | AC-06 | example | PENDING | `tests/unit/cv/overview-sections.test.ts` |
| U25 | `overviewSections` never returns a non-skills key when other sections are present | AC-06 | example | PENDING | `tests/unit/cv/overview-sections.test.ts` |
| U26 | `allowedProfiles` keeps `GitHub` and `LinkedIn` in source order | AC-35, FR-006 | example | PENDING | `tests/unit/cv/allowed-profiles.test.ts` |
| U27 | `allowedProfiles` matches network names case-insensitively (`github`, `LINKEDIN`) | AC-35 | example | PENDING | `tests/unit/cv/allowed-profiles.test.ts` |
| U28 | `allowedProfiles` drops any other network (`GitLab`, `Mastodon`, `''`) | AC-35, FR-006 | example | PENDING | `tests/unit/cv/allowed-profiles.test.ts` |
| U36 | `entryTitle` returns `''` when the primary field is absent or not a string | FR-014 | example | PENDING | `tests/unit/cv/entry-title.test.ts` |
| U37 | `entryTitle` throws an `Error` for a section key outside `SECTION_ORDER` | FR-014 | example | PENDING | `tests/unit/cv/entry-title.test.ts` |
| U38 | `allowedProfiles(undefined)` and basics without `profiles` both return `[]` | AC-35, FR-014 | example | PENDING | `tests/unit/cv/allowed-profiles.test.ts` |
| U39 | A non-skill entry with `views: []` or no `views` is in no view's result | AC-02, FR-002 | example | PENDING | `tests/unit/cv/sections-for-view.test.ts` |

U36–U39 were appended in fix round 1. They cover the contract behaviour the spec's View-Selection Contract states for these functions (FR-014). Ids U29–U35 are unchanged, and the gap in numbering is normal.

### `src/lib/cv.ts` additions (CV2)

| id | behavior | traces | kind | state | test |
| --- | --- | --- | --- | --- | --- |
| U29 | `entryDetails` lists the present shown fields other than the title, in the spec's table order, per section | AC-14, FR-003 | example | PENDING | `tests/unit/cv/entry-details.test.ts` |
| U30 | `entryDetails` leaves out shown fields that are absent | AC-14 | example | PENDING | `tests/unit/cv/entry-details.test.ts` |
| U31 | `entryDetails` never includes `startDate`, `endDate`, `date`, `work.location` or `education.score` | FR-003 | example | PENDING | `tests/unit/cv/entry-details.test.ts` |
| U32 | `entryDetails` returns `highlights` (or `keywords`) as separate items in order | AC-14 | example | PENDING | `tests/unit/cv/entry-details.test.ts` |
| U33 | `showPlaceholder` is true when `meta.placeholder === true` | AC-36, FR-007 | example | PENDING | `tests/unit/cv/placeholder.test.ts` |
| U34 | `showPlaceholder` is false when `meta` is absent, or `placeholder` is `false`, absent or the string `"true"` | AC-36, FR-007 | example | PENDING | `tests/unit/cv/placeholder.test.ts` |

### Existing pages (characterization)

| id | behavior | traces | kind | state | test |
| --- | --- | --- | --- | --- | --- |
| U35 | `/` and `/_fonts/` still match their committed baselines at 390 and 1280 | INV-1 | characterization | BASELINE | `tests/visual/pages.spec.ts` (existing) |

**INV-1** (recorded invariant): the home and font-comparison pages are unchanged by this feature (spec §Assumptions: "The home page is unchanged by this feature"). The existing visual suite already captures them, green at `28afd33`, so no new test is needed. CV tasks must keep it green.

## Invariants and edge cases still to place

None. Every behavior above has a home.

## Out of scope

- **Inner unit tests for Astro components and pages** (`src/components/cv/*`, `src/pages/cv/*`, `src/pages/404.astro`, `src/layouts/Cv.astro`): the outer loop (A11–A42) drives them directly through the built pages. Rendering components inside Vitest would need Astro's container API, which this repository does not use. Their logic is pushed into `src/lib/cv.ts` (U29–U34) so it is unit-tested there.
- **Long unbroken text at 390px**: sampled only with the current content through A27 and A36. A synthetic long-string fixture would need a second content build, and no criterion asks for one.
- **`meta.placeholder` false at page level**: A31 and A40 assert the current (`true`) state. The false branch is unit-tested by U34.
- **Empty view at page level**: A20 checks the current content, where every view has entries, so only the "absent" side runs end to end. The selection side (U19, A7) covers the empty case.
- **Case-variant routes** such as `/cv/Engineering/`: out of scope in spec §Edge Cases.
- **Property-based invariants** (order preservation, partition of entries by view): no property library in the profile. They are sampled with examples at the boundaries (U11–U17).
- **Design-critic scores for the view pages**: no page id for nested routes in the gate (research R12). Covered instead by A33, A42 and A44 plus owner review.

## Verification commands

Copied from `.specify/memory/tdd-profile.md` at planning time:

- Single test (unit): `null` (Vitest `-t` exits 0 on no match). Run the file: `npx vitest run {file}`
- Single test (acceptance): `npx playwright test {file} -g "{name}"` (after `npm run build`)
- Full suite: `npm run test:unit && npm run build && npx playwright test`
- Coverage: `null` (`@vitest/coverage-v8` not installed)
- Mutation: `null` (no tool; `/speckit-tdd-verify` uses deliberate mutants)
- Visual (A44, U35): `npm run test:visual` (Linux image, Docker)
