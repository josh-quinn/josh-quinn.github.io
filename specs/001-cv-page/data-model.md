# Data Model: CV pages

The single source is `src/content/resume.json`, validated by `src/content/resume.schema.json` (a JSON Resume subset plus `views`). This feature reads it and never writes it. Types below are the subset `src/lib/cv.ts` declares. Field names match the schema exactly.

## Resume

| Field | Type | Notes |
|---|---|---|
| `meta` | `{ placeholder?: boolean; note?: string }` optional | `placeholder === true` turns on the "Sample content" notice (FR-007). Ignored by the selection functions. |
| `basics` | `Basics` | Required. |
| `work`, `projects`, `education`, `certificates`, `awards`, `volunteer`, `interests`, `skills` | arrays of the section entry types, each optional | A missing key is treated as `[]` (AC-07). |

## Basics

| Field | Type | Shown | Notes |
|---|---|---|---|
| `name` | string | overview `h1`; every CV page header; every CV `<title>` | |
| `label` | string | every CV page | |
| `summary` | string optional | overview only (clarify Q3) | |
| `location.region` | string optional | overview only | "Ireland". Nothing finer (constitution III). `countryCode` is never shown. |
| `profiles[]` | `Profile[]` | allowed profiles only | |

The schema forbids `email` and `phone` (`false`).

## Profile

| Field | Type | Notes |
|---|---|---|
| `network` | string | Allowed when it equals `GitHub` or `LinkedIn`, case-insensitive. It is the link text. |
| `username` | string | Not shown as text; it is part of `url`. |
| `url` | string (`^https://`) | The link `href`. |

## View

`'engineering' | 'ocean' | 'life'`. Order and titles are fixed: `VIEWS = ['engineering', 'ocean', 'life']` and `VIEW_TITLES = { engineering: 'Engineering', ocean: 'Ocean', life: 'Life' }`. Route: `/cv/<view>/`. The schema's `views` enum is the same set; `views` arrays have at least one item and unique items.

## Section

| Key | Heading | Primary field | Shown fields | `views` |
|---|---|---|---|---|
| `work` | Work | `name` | `name`, `position`, `summary`, `highlights[]` | required |
| `projects` | Projects | `name` | `name`, `description`, `highlights[]` | required |
| `education` | Education | `institution` | `institution`, `studyType`, `area` | required |
| `certificates` | Certificates | `name` | `name`, `issuer` | required |
| `awards` | Awards | `title` | `title`, `awarder`, `summary` | required |
| `volunteer` | Volunteering | `organization` | `organization`, `position`, `summary`, `highlights[]` | required |
| `interests` | Interests | `name` | `name`, `keywords[]` | required |
| `skills` | Skills | `name` | `name`, `keywords[]` | optional |

Never shown, even when present: `startDate`, `endDate`, `date`, `work.location`, `education.score` (FR-003).

## SectionResult (module output)

`{ key: SectionKey; entries: Entry[] }`, where the entries are the source entry objects (deep-equal, not copied with changes) in content-file order. Lists of `SectionResult` are always in `SECTION_ORDER` and never hold an empty `entries` (AC-03).

## Selection rules

- **View page V**: for each key in `SECTION_ORDER`, take the entries whose `views` includes V. Drop the key when none match (FR-002).
- **Overview**: `skills` only, every skill, whether or not it has `views`. Drop it when there are no skills (FR-004, AC-06).
- **Empty view**: when no section matches, the page shows the `data-cv-empty` line (AC-20).

There is no state and no lifecycle. Everything is computed at build time from the file.
