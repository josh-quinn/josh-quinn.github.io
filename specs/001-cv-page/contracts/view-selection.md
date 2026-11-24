# Contract: view-selection module (`src/lib/cv.ts`)

The public surface the pages and the CV1 acceptance tests depend on. It restates the spec's View-Selection Contract with types. The spec is authoritative if the two ever differ.

```ts
export const VIEWS: readonly ['engineering', 'ocean', 'life'];
export type View = (typeof VIEWS)[number];

export const SECTION_ORDER: readonly [
  'work', 'projects', 'education', 'certificates', 'awards', 'volunteer', 'interests', 'skills',
];
export type SectionKey = (typeof SECTION_ORDER)[number];

export function isView(value: string): value is View;           // exact, case-sensitive
export function entryTitle(section: SectionKey, entry: Entry): string; // primary field

export interface SectionResult { key: SectionKey; entries: Entry[] }
export function sectionsForView(resume: Resume, view: string): SectionResult[]; // throws Error if !isView(view)
export function overviewSections(resume: Resume): SectionResult[];   // [] or [{ key: 'skills', entries }]
```

Additional exports the pages may use. They are not part of the acceptance contract; inner unit tests cover them:

```ts
export const VIEW_TITLES: Record<View, string>;            // Engineering, Ocean, Life
export const SECTION_HEADINGS: Record<SectionKey, string>; // Work, Projects, ..., Volunteering, ..., Skills
export function viewPath(view: View): string;              // '/cv/<view>/'
export function allowedProfiles(basics: Basics): Profile[]; // GitHub and LinkedIn only, case-insensitive, in order
// Added in CV2, so page logic stays unit-testable:
export function entryDetails(section: SectionKey, entry: Entry): { lines: string[]; items: string[] };
  // lines: present shown fields other than the title, in the spec's Shown fields order; items: highlights or keywords
export function showPlaceholder(resume: Resume): boolean;  // true only when meta?.placeholder === true
```

## Behaviour guarantees

1. Pure: no I/O, no globals, input never mutated (AC-09).
2. A missing section key is `[]`. `meta` and `basics` are ignored by both section functions (AC-07).
3. Output order: `SECTION_ORDER`, then content-file order (AC-02, AC-03).
4. An entry is returned once per view it is tagged for (AC-04).
5. Skills without `views` are in no view's result (AC-05).
6. `sectionsForView` with a non-view throws `Error` with a message naming the value (AC-08).
7. The module contains no content-file values (AC-24).
