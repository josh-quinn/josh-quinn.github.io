# Feature Specification: CV pages

**Feature Branch**: `001-cv-page` (specified on `slice/08-cv-spec`; built one gate task per `task/<id>-<slug>` branch)

**Created**: 2026-11-24

**Status**: Draft

**Input**: User description: "CV pages for a public personal site, rendered from `src/content/resume.json`. Routes: `/cv` (combined overview linking to each view and showing basics and summary), `/cv/engineering`, `/cv/ocean`, `/cv/life`. Static HTML, no client JS. An entry appears on every view listed in its `views` array. Contact is via LinkedIn and GitHub profile links only. Acceptance criteria must include:
- no private data in any built HTML, using the patterns in `tests/privacy/patterns.ts`
- no `<script>` tags on CV routes
- no horizontal overflow at 390px
- zero axe violations
- each view lists exactly the entries tagged for it
- unknown view `/cv/foo` returns the site 404
- visual match to approved baselines

Look and feel per `DESIGN.md`."

## Clarifications

### Session 2026-11-24

The owner delegated these answers to the controller. Each answer applies the controller's rulings and the constitution.

- Q: For the "no hard-coded content" check, which content-file values count, given that the code must legitimately contain view tags such as `engineering` and network names such as `LinkedIn`? → A: Only the values a page renders: `basics.name`, `basics.label`, `basics.summary`, each profile's `username` and `url`, and every shown field of every entry. View tags, `meta`, profile `network` names and `location` are excluded. (AC-24)
- Q: Where does the "Sample content" notice go, what exactly does it say, and does the 404 page show it? → A: Exactly once on each CV page, text exactly `Sample content`, before the `h1` in document order. Not on the 404 page. (FR-007, AC-36)
- Q: Do view pages repeat the overview's summary and location, or only the name and label? → A: Only the name and label. The summary and location are on the overview alone. (FR-005, AC-15)
- Q: Should the build fail when the content file breaks its schema? → A: No new build-time validation. The existing content unit test (schema validation in `tests/unit/content/`) stays the guard, and pages assume schema-valid content.
- Q: Should CV pages carry a site-wide navigation or a link to the home page? → A: (Revised in fix round 1 by controller ruling, owner-delegated. The first answer was "No".) Yes, a small home link and nothing more. Each CV page has a modest `header` before its `h1`, holding one link to `/` whose text is `basics.name`. There is no other site navigation, and the home page itself is unchanged. `/` already exists, so the link never breaks the internal-link check in any delivery slice. (FR-015, AC-39)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a focused view of the CV (Priority: P1)

A visitor (a recruiter, a collaborator, a friend) opens one view of the CV: engineering, ocean or life. They see only the entries that belong to that view, grouped into familiar CV sections, in a quiet, readable page that works on a phone.

**Why this priority**: The views are the point of the feature: one source of CV content, three audiences. Without them there is nothing to show beyond a name.

**Independent Test**: Build the site and open `/cv/engineering/`, `/cv/ocean/` and `/cv/life/`. Compare the sections and entries on each page with the entries in `src/content/resume.json` whose `views` include that view.

**Acceptance Scenarios**:

1. **Given** the built site, **When** a visitor opens `/cv/engineering/`, **Then** they see every entry tagged `engineering`, and no other entry, grouped by section in the fixed section order.
2. **Given** an entry tagged for two views, **When** the visitor opens either view, **Then** the entry appears on both.
3. **Given** a section with no entry tagged for the view, **When** the visitor opens that view, **Then** the section is not shown at all.
4. **Given** a view page, **When** the visitor wants another view, **Then** links to all three views are on the page and the current one is marked.

---

### User Story 2 - Land on the CV overview (Priority: P2)

A visitor opens `/cv/`. They see who the CV is about (name, title, summary, location), how to get in touch (GitHub and LinkedIn only), the skills list, and a link to each of the three views.

**Why this priority**: It is the entry point and the page people are sent to, but it adds little without the views behind it.

**Independent Test**: Open `/cv/` and check the basics, the contact links, the skills section and the three view links against `src/content/resume.json`.

**Acceptance Scenarios**:

1. **Given** the built site, **When** a visitor opens `/cv/`, **Then** they see the name, the professional label, the summary and the location "Ireland".
2. **Given** `/cv/`, **When** the visitor picks a view link, **Then** they reach that view page.
3. **Given** `/cv/`, **When** the visitor looks for contact details, **Then** the only routes offered are the GitHub and LinkedIn profile links.

---

### User Story 3 - Trust the page (Priority: P3)

The owner publishes the CV on a public site. They need to know that no private detail leaks into the built pages, that the pages carry no client-side script, that they are accessible, that they hold up at phone width, that they look like the rest of the site, and that a mistyped view gives the site's normal "not found" page.

**Why this priority**: These are the guarantees that let the owner publish at all. They cut across every page, so they are checked on every route.

**Independent Test**: Build the site, then run the privacy patterns, a script scan, a 390px overflow check, an accessibility scan and the visual regression suite on every CV route and the 404 page. Request `/cv/foo/` and check for the 404.

**Acceptance Scenarios**:

1. **Given** the built site, **When** the privacy patterns run over the built HTML of every CV route, **Then** nothing matches.
2. **Given** a CV route, **When** its HTML is inspected, **Then** it contains no `<script>` element.
3. **Given** a 390px-wide screen, **When** a CV route is opened, **Then** nothing scrolls sideways.
4. **Given** `/cv/foo/`, **When** it is requested, **Then** the response is the site's 404 page with status 404.

---

### Edge Cases

- **Entry tagged for several views**: it appears once on each of those views, never twice on one view.
- **Section with no tagged entries on a view**: the section, its heading included, is omitted from that view.
- **View with no tagged entries at all**: the view page is still built and shows a short empty-state line (see AC-20) instead of sections.
- **Section missing from the content file**: treated as an empty section. Nothing fails.
- **Skill without `views`**: it appears on `/cv/` only, never on a view page.
- **Skill with `views`**: it appears on `/cv/` and on each view it is tagged for.
- **Unknown or malformed view** (`/cv/foo/`, `/cv/foo`, `/cv/engineering/extra/`): the site 404 page, status 404.
- **Profiles other than GitHub and LinkedIn** in the content file: not shown.
- **Dates, `work.location` or `education.score` in the content file**: never shown (the current content has none; the owner ruled out personal-history dates).
- **Long unbroken words or URLs in content**: wrap rather than push the page wider than 390px.
- **Reduced motion**: nothing moves.
- **`meta.placeholder` false or absent**: no "Sample content" notice.
- Case variants such as `/cv/Engineering/` are out of scope. The host's file-system case rules decide them.

## Requirements *(mandatory)*

### Definitions

These terms are used by every requirement and acceptance criterion below.

- **Content file**: `src/content/resume.json`, validated by `src/content/resume.schema.json`. Its content is currently a fictional placeholder persona (`meta.placeholder: true`).
- **Views**: exactly `engineering`, `ocean` and `life`, in that order. **View titles**: `Engineering`, `Ocean`, `Life`.
- **CV routes**: the overview `/cv/` and the **view routes** `/cv/engineering/`, `/cv/ocean/` and `/cv/life/`. Links use these trailing-slash forms.
- **404 page**: the site-wide not-found page, built as `404.html` at the site root.
- **Sections**, in this fixed **section order**, with their content-file key, heading text and **primary field**:

  | # | Key | Heading text | Primary field |
  |---|---|---|---|
  | 1 | `work` | Work | `name` |
  | 2 | `projects` | Projects | `name` |
  | 3 | `education` | Education | `institution` |
  | 4 | `certificates` | Certificates | `name` |
  | 5 | `awards` | Awards | `title` |
  | 6 | `volunteer` | Volunteering | `organization` |
  | 7 | `interests` | Interests | `name` |
  | 8 | `skills` | Skills | `name` |

- **Tagged for view V**: an entry whose `views` array contains V. An entry whose `views` is absent or empty is tagged for no view, whatever its section. The schema allows that only for skills, but the selection rules do not rely on the schema.
- **Expected sections for view V**: for each section in section order, the entries tagged for V, in content-file order. Sections with no such entry are left out.
- **Shown fields** of an entry: the fields below that are present in the content file. Other fields are never shown.

  | Section | Shown fields |
  |---|---|
  | `work` | `name`, `position`, `summary`, each of `highlights` |
  | `projects` | `name`, `description`, each of `highlights` |
  | `education` | `institution`, `studyType`, `area` |
  | `certificates` | `name`, `issuer` |
  | `awards` | `title`, `awarder`, `summary` |
  | `volunteer` | `organization`, `position`, `summary`, each of `highlights` |
  | `interests` | `name`, each of `keywords` |
  | `skills` | `name`, each of `keywords` |

- **Allowed profiles**: entries of `basics.profiles` whose `network` is `GitHub` or `LinkedIn` (case-insensitive).
- **Text of an element**: its `textContent` with runs of whitespace collapsed to one space and trimmed.

### Functional Requirements

- **FR-001**: The site MUST build the four CV routes as static HTML pages from the content file at build time. No CV page may carry content that is written into the page source instead of read from the content file.
- **FR-002**: Each view route MUST list exactly the expected sections for its view: every entry tagged for it, no other entry, in section order and then content-file order, with empty sections left out.
- **FR-003**: Each entry MUST show its shown fields and nothing else from the content file. Dates, `work.location` and `education.score` MUST NOT be shown, even when present.
- **FR-004**: The overview `/cv/` MUST show `basics.name`, `basics.label`, `basics.summary` and the location `basics.location.region` ("Ireland"), a link to each view, the allowed profile links, and a Skills section listing every skill in content-file order (with or without `views`). It MUST NOT show any other section.
- **FR-005**: Every view page MUST show `basics.name` and `basics.label` (not the summary or location, which are on the overview only), links to all three views with the current one marked, a link back to the overview, the home link of FR-015, and the allowed profile links.
- **FR-006**: The only contact routes on any CV page MUST be the allowed profile links. No email address, phone number, `mailto:` or `tel:` link may appear.
- **FR-007**: When `meta.placeholder` is `true`, every CV page MUST show, once and before its `h1`, a small, unobtrusive mono-style notice reading exactly "Sample content". When it is not `true`, no notice is shown. The 404 page never shows it.
- **FR-008**: A request for any path that is not a built page, including `/cv/<anything other than the three views>/`, MUST get the site 404 page with HTTP status 404.
- **FR-009**: CV pages and the 404 page MUST contain no client-side script: no `<script>` element, no inline event-handler attribute, no `javascript:` URL.
- **FR-010**: CV pages and the 404 page MUST contain nothing that matches the privacy patterns in `tests/privacy/patterns.ts` (the built-in patterns plus the terms in the gitignored `.private/forbidden.txt` when that file exists), and no year-shaped text.
- **FR-011**: CV pages and the 404 page MUST follow `DESIGN.md`: grid-paper background, islands for small grouped facts (at most two per page), small mono labels, italic serif `h1`/`h2`, 18px body text, motion in CSS only and none under reduced motion, and no horizontal overflow at 390px.
- **FR-012**: CV pages and the 404 page MUST have zero axe violations.
- **FR-013**: CV pages and the 404 page MUST match owner-approved visual baselines at 390px and 1280px.
- **FR-014**: The view-selection rules (which entries go on which page) MUST live in one shared module with the contract below, so they are unit-testable apart from the pages.
- **FR-015**: Every CV page MUST start with a modest site header, before its `h1`, holding exactly one link home (`href="/"`, text `basics.name`). The header holds no other navigation.

### View-Selection Contract

The module `src/lib/cv.ts` exports exactly these TypeScript signatures and types. This is the single contract: `plan.md` and `contracts/view-selection.md` refer to it and do not restate it. Acceptance tests import the module directly (no browser) and pass content objects built at runtime. The gate's build step runs `astro check`, and `tsconfig.json` includes every file, so acceptance tests are type-checked against these types. The input types are deliberately loose: every key is optional, `views` is optional on every section's entries, and section keys are accepted as plain `string`. That way the fixtures AC-02 to AC-10 need (entries with no `views`, absent sections, iteration over string keys) type-check.

```ts
export const VIEWS: readonly ['engineering', 'ocean', 'life'];
export type View = (typeof VIEWS)[number];

export const SECTION_ORDER: readonly [
  'work', 'projects', 'education', 'certificates', 'awards', 'volunteer', 'interests', 'skills',
];
export type SectionKey = (typeof SECTION_ORDER)[number];

/** One content entry as read from JSON. `views` is optional here for every section. */
export interface Entry {
  readonly views?: readonly string[];
  readonly [field: string]: unknown;
}

export interface Profile {
  readonly network: string;
  readonly username: string;
  readonly url: string;
}

export interface Basics {
  readonly name?: string;
  readonly label?: string;
  readonly summary?: string;
  readonly location?: { readonly countryCode?: string; readonly region?: string };
  readonly profiles?: readonly Profile[];
}

/** The content file, or any runtime fixture of it. Every key is optional. */
export interface Resume {
  readonly meta?: { readonly placeholder?: unknown; readonly [key: string]: unknown };
  readonly basics?: Basics;
  readonly work?: readonly Entry[];
  readonly projects?: readonly Entry[];
  readonly education?: readonly Entry[];
  readonly certificates?: readonly Entry[];
  readonly awards?: readonly Entry[];
  readonly volunteer?: readonly Entry[];
  readonly interests?: readonly Entry[];
  readonly skills?: readonly Entry[];
}

export interface SectionResult {
  readonly key: SectionKey;
  readonly entries: readonly Entry[];
}

// Acceptance-tested (AC-01 to AC-10):
export function isView(value: string): value is View;
export function entryTitle(section: string, entry: Entry): string;
export function sectionsForView(resume: Resume, view: string): SectionResult[];
export function overviewSections(resume: Resume): SectionResult[];

// Also exported for the pages; covered by inner unit tests, not acceptance tests:
export const VIEW_TITLES: Readonly<Record<View, string>>;          // Engineering, Ocean, Life
export const SECTION_HEADINGS: Readonly<Record<SectionKey, string>>; // the Sections table headings
export function viewPath(view: View): string;                        // '/cv/<view>/'
export function allowedProfiles(basics: Basics | undefined): Profile[];
export function entryDetails(section: string, entry: Entry): { lines: string[]; items: string[] };
export function showPlaceholder(resume: Resume): boolean;           // true only when meta.placeholder === true
```

Behaviour:

- `isView` is `true` only for the three view names, compared exactly (case-sensitive).
- `entryTitle` returns the entry's primary field (Sections table), or `''` when that field is absent or not a string. It throws an `Error` when `section` is not one of `SECTION_ORDER`.
- `sectionsForView` returns the expected sections for `view`: one item per non-empty section, in section order, each holding the tagged entries in content-file order. It throws an `Error` naming the value when `isView(view)` is false.
- `overviewSections` returns `[{ key: 'skills', entries: <every skill, in order> }]`, or `[]` when there are no skills. It never returns any other section.
- Both section functions treat a missing section key as empty, ignore `meta` and `basics`, never mutate their input, and return entries deep-equal to the source entries.
- `allowedProfiles` keeps the allowed profiles in source order. `entryDetails` returns the present shown fields other than the primary field as `lines` (Shown fields order) and each `highlights` or `keywords` item as `items`, and never a date, `work.location` or `education.score`.

### Page Structure Contract

Acceptance tests find content through these observable hooks, so every CV page MUST expose them.

- Exactly one `h1` per page. On the overview its text is `basics.name`. On a view page it is the view title.
- Before the `h1`, a `header` element (the modest site header) holding exactly one `a`, whose `href` is `/` and whose text is `basics.name`. The header holds no other link.
- Each shown section is a `section` element with `data-cv-section="<key>"`, containing an `h2` whose text is the section's heading text.
- Each entry is an element with the attribute `data-cv-entry`, inside its section, containing exactly one `h3` whose text is the entry's primary field value.
- The view links are inside `nav[aria-label="CV views"]`: one `a` per view, in view order, link text equal to the view title, `href` equal to the view route. On a view page the current view's link has `aria-current="page"`.
- On a view page, a link with text `CV overview` and `href="/cv/"`, outside `nav[aria-label="CV views"]` (so that nav always holds exactly the three view links).
- Each allowed profile link is an `a` whose `href` is the profile `url` and whose text is the profile `network`.
- The placeholder notice is an element with the attribute `data-cv-placeholder`.
- The empty-state line on a view with no entries is an element with the attribute `data-cv-empty`.
- Islands use the design system's `island` class.

### Acceptance Criteria

Each criterion is self-contained, and its expectations are computed from the content file when the test runs, never copied into the test. "Route set R" is the set of routes named for that criterion in **Delivery Slices** below. Browser checks run against the built site served by `astro preview`. Build-output checks read `dist/`. Module checks (AC-01 to AC-10) run in the same Playwright test runner without a browser page. They may load `src/lib/cv.ts` with a dynamic `import()` inside each test, so that before the module exists each test fails on its own instead of the whole file failing to load.

**View selection (module, no browser)**

- **AC-01**: `VIEWS` and `SECTION_ORDER` equal the arrays in the View-Selection Contract, in order.
- **AC-02**: For a runtime fixture that has entries in all eight sections, tagged with assorted combinations of views (including none, one, two and all three), `sectionsForView(fixture, V)` for each V equals the expected sections for V. The same holds for the parsed content file.
- **AC-03**: The `key`s returned by `sectionsForView` are in section order, and no returned item has an empty `entries` array.
- **AC-04**: An entry tagged for several views appears exactly once in the result for each of those views, and in no other view's result.
- **AC-05**: A skill without `views` is in no view's result. A skill with `views: ['ocean']` is in the `ocean` result only.
- **AC-06**: `overviewSections` returns exactly one item, `{ key: 'skills', entries }`, with every skill (with or without `views`) in content-file order. It returns `[]` for content with no `skills` key or an empty `skills` array, and never returns another key, even when other sections are present.
- **AC-07**: Content whose only key is `basics` gives `[]` from `sectionsForView` for every view, without throwing. Content with some section keys absent gives the same result as with those keys set to `[]`.
- **AC-08**: `isView` is true for `engineering`, `ocean` and `life`, and false for `foo`, `''`, `Engineering`, `engineering/` and `cv`. `sectionsForView(content, 'foo')` throws an `Error`.
- **AC-09**: Calling either section function leaves its input deep-equal to a copy taken before the call, and every returned entry is deep-equal to its source entry.
- **AC-10**: `entryTitle(key, entry)` returns the primary field value from the Sections table for each of the eight sections.

**View pages**

- **AC-11**: Each view route responds with status 200 and an HTML page whose single `h1` text is the view title.
- **AC-12**: On each view route, the `data-cv-section` values, in document order, equal the keys of the expected sections for that view. Inside each section, the `h3` texts of its `data-cv-entry` elements, in document order, equal the primary field values of that section's expected entries. No other `data-cv-entry` element is on the page. *(This is the brief's "each view lists exactly the entries tagged for it".)*
- **AC-13**: On each view route, each `data-cv-section` element contains an `h2` whose text is that section's heading text.
- **AC-14**: On each view route, the text of each `data-cv-entry` element contains the text of every shown field present on its source entry, and each `highlights` and `keywords` item is its own `li`.
- **AC-15**: Each view route shows the text of `basics.name` and `basics.label`, and the text of its `body` does not contain `basics.summary`.
- **AC-16**: Each view route has `nav[aria-label="CV views"]` containing exactly three links, in view order, with the view titles as text and the view routes as `href`. Only the current view's link has `aria-current="page"`.
- **AC-17**: Each view route has a link with text `CV overview` and `href="/cv/"`.
- **AC-18**: The site 404 page is built as `dist/404.html`. Every HTML file under `dist/cv/` is one of `dist/cv/index.html`, `dist/cv/engineering/index.html`, `dist/cv/ocean/index.html` or `dist/cv/life/index.html`.
- **AC-19**: Requests for `/cv/foo/`, `/cv/foo`, `/cv/engineering/extra/` and `/no-such-page/` each respond with status 404 and a page whose `h1` text is `Page not found` and which has a link with `href="/"`.
- **AC-20**: On each view route, a `data-cv-empty` element whose text is `Nothing listed for this view yet.` is present when the view's expected sections are empty, and absent otherwise.

**Overview page**

- **AC-21**: `/cv/` responds with status 200. Its single `h1` text is `basics.name`, and the page text contains `basics.label`, `basics.summary` and `basics.location.region`.
- **AC-22**: `/cv/` has `nav[aria-label="CV views"]` containing exactly three links, in view order, with the view titles as text and the view routes as `href`, and none with `aria-current`. Following each link reaches a page with status 200 whose `h1` text is that view title.
- **AC-23**: On `/cv/`, the only `data-cv-section` is `skills`. Its `data-cv-entry` `h3` texts equal the `name` of every skill in content-file order, and each entry's text contains each of its `keywords`.
- **AC-24**: Take the **rendered values** of the content file: `basics.name`, `basics.label`, `basics.summary`, each profile's `username` and `url`, and every shown field (including each `highlights` and `keywords` item) of every entry in the eight sections. No file under `src/` other than `src/content/**`, `src/pages/index.astro` and `src/pages/_fonts.astro` contains, verbatim, any rendered value that is 8 or more characters long. View tags, `meta`, profile `network` names and `location` are not rendered values. *(Pages render the content file; they never hard-code it.)*

**Every page in route set R** (cross-cutting; each delivery slice tests its own routes)

- **AC-30 Privacy**: The built HTML file of each route in R, read raw, attributes included, passes `assertNoPrivateData` from `tests/privacy/patterns.ts` with its default patterns: the built-in patterns plus `.private/forbidden.txt` terms when that file exists. The rendered body text of each route contains no match for `\b(19|20)\d{2}\b`.
- **AC-31 No script**: The built HTML file of each route in R contains no `<script` (case-insensitive), no inline event-handler attribute (any element attribute whose full name matches `^on[a-z]+$`, case-insensitive, such as `onclick`, so that `content` and `controls` do not count), and no `javascript:` (case-insensitive). Loaded in the browser, `document.scripts.length` is 0.
- **AC-32 No overflow at 390px**: With a 390×844 viewport, after load and `document.fonts.ready`, `document.documentElement.scrollWidth` is at most `document.documentElement.clientWidth` on each route in R.
- **AC-33 Accessibility**: An axe scan with the default rule set, run after the page's finite animations finish (as in `tests/a11y/axe.spec.ts`), reports zero violations on each route in R.
- **AC-34 Reduced motion**: With `prefers-reduced-motion: reduce` emulated, `document.getAnimations()` is empty after load on each route in R.
- **AC-35 Contact**: On each CV route in R, the `a` elements whose `href` starts with `http` are exactly the allowed profile links, once each, with `href` equal to the profile `url` and text equal to the profile `network`. No `href` starts with `mailto:` or `tel:`. The 404 page has no off-site links.
- **AC-36 Placeholder notice**: When the content file has `meta.placeholder === true`, each CV route in R has exactly one `data-cv-placeholder` element, whose text is exactly `Sample content`, which comes before the page's `h1` in document order, and whose computed `font-family` includes `Departure Mono`. Otherwise no CV route has such an element. The 404 page never has one.
- **AC-37 Document**: Each route in R has `<html lang="en">`, a non-empty `<title>` and a `meta[name="description"]` with non-empty `content`. CV route titles contain `basics.name` and are distinct from each other. The 404 title contains `Page not found`.
- **AC-38 Design basics**: On each route in R at 1280px, the computed `font-size` of `body` is `18px`, every `h1` and `h2` has computed `font-style: italic`, the `body::before` computed `background-image` is not `none` (the grid paper), and there are at most two `.island` elements. `/cv/` has at least one.
- **AC-39 Home link**: On each CV route in R, the first `header` element comes before the `h1` in document order and contains exactly one `a`, with `href="/"` and text equal to `basics.name`. The 404 page is not a CV route; its link home is AC-19's.

**Visual baselines**

- **AC-50**: For each page id and route, `cv` (`/cv/`), `cv-engineering` (`/cv/engineering/`), `cv-ocean` (`/cv/ocean/`), `cv-life` (`/cv/life/`) and `404` (`/cv/foo/`), and for each width 390 and 1280:
  - (a) the file `tests/visual/__screenshots__/<id>-<width>.png` exists and is a PNG image whose header width is `<width>` pixels;
  - (b) the visual suite has a test for it. The output of `npx playwright test -c playwright.visual.config.ts --list`, run on the host (listing renders nothing, so no Docker is needed), contains a test titled exactly `<id> at <width>px matches its baseline`.

  Part (b) is what makes the gate's `visual` check compare that route, because that check runs only the tests the suite lists.
- **AC-51**: The site's visual regression suite (`tests/visual/`, run in the Linux Playwright image by `npm run test:visual` and the gate's `visual` check) renders each AC-50 route at 390px and 1280px and matches its baseline within the suite's existing tolerance. This criterion is verified by the gate's `visual` check, not by a host acceptance test, because baselines render only in the Linux image. The baselines are approved by the owner before they are committed.

### Delivery Slices

Each slice is one gate task and one pull request. Its acceptance tests live in `tests/acceptance/<id>/`.

| Gate task | Scope | Owns | Route set R for AC-30 to AC-39 |
|---|---|---|---|
| `CV1` | View-selection module | AC-01 to AC-10 | none |
| `CV2` | View pages and the site 404 page | AC-11 to AC-16, AC-18 to AC-20, AC-30 to AC-39 | `/cv/engineering/`, `/cv/ocean/`, `/cv/life/`, `/cv/foo/` (the 404 page) |
| `CV3` | Overview page, and the back-link to it from each view | AC-17, AC-21 to AC-24, AC-30 to AC-39 | `/cv/` |
| `CV4` | Visual baselines for all CV pages and the 404 page | AC-50, AC-51 | none |

AC-17 (the `CV overview` back-link on view pages) is owned by `CV3`, not `CV2`, so that no build ever links to a page that does not exist yet.

### Key Entities

- **Content file (resume)**: basics (name, label, summary, location region, profiles) plus eight sections of entries. Each entry except skills carries a `views` array. `meta.placeholder` marks fictional content.
- **View**: one of three audiences (`engineering`, `ocean`, `life`) with a title and a route.
- **Section**: a CV heading with a fixed position in the section order, a heading text and a primary field.
- **Entry**: one item in a section. It is identified on the page by its primary field and shows its shown fields.
- **Profile**: a public social link. Only GitHub and LinkedIn are shown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor on the overview reaches any of the three views in one click, and any view reaches the other two and the overview in one click.
- **SC-002**: On every view, 100% of the entries tagged for it are shown, and 0 untagged entries are shown.
- **SC-003**: The privacy patterns find 0 matches in every built CV page and the 404 page.
- **SC-004**: Every CV page reads fully on a 390px-wide phone screen with no sideways scrolling, and has 0 accessibility violations in an automated scan.
- **SC-005**: Every CV page shows its full content with scripting disabled, because it carries no script.
- **SC-006**: Every CV page and the 404 page match their owner-approved look at phone (390px) and desktop (1280px) widths.
- **SC-007**: Changing an entry's `views` in the content file and rebuilding moves it between views with no other edit.

## Assumptions

- The content stays fictional placeholder content (`meta.placeholder: true`) until the owner approves real content. The pages render whatever the content file holds.
- The schema already forbids `basics.email` and `basics.phone`. The pages add a second line of defence by showing only the allowed profile links.
- `astro preview` serves `404.html` with status 404 for unknown paths, as GitHub Pages does. Both serve `/cv/foo` (no trailing slash) as not found.
- The design-first phase (before any gate task) produces the approved look for `/cv/` and its baselines `cv-390.png` and `cv-1280.png`. `CV4` adds the view and 404 baselines with owner approval.
- Section heading texts, view titles, the "Sample content", "CV overview", "Page not found" and empty-state texts are site chrome, not CV content, so they may be written in the page source.
- The view-selection and page-structure contracts are deliberately concrete so that the test author, who reads only this spec, can write the acceptance tests without seeing any plan or code.
- The home page is unchanged by this feature. CV pages carry only a modest header with one link home (FR-015) and no other site navigation. Adding a link to `/cv/` from the home page is a separate decision, because it would change the home page's visual baselines.
- The content file is assumed schema-valid. The existing content unit test (`tests/unit/content/`) enforces the schema; this feature adds no build-time validation.
