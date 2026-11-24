# Contract: view-selection module (`src/lib/cv.ts`)

**The contract is spec.md §View-Selection Contract.** It holds the exact exported TypeScript signatures and types, and their behaviour. This file does not restate them, so there is one source of truth. The test author sees only the spec, and the acceptance tests are type-checked against it by `astro check` in the gate's build step.

## Implementation notes (plan side only)

1. **Input types are loose on purpose.** `Entry.views` is optional for every section, every `Resume` key is optional, and `entryTitle` / `entryDetails` take `section: string`. The pages may narrow internally, for example with `isView` or a `SectionKey` guard. Exported signatures must stay exactly as the spec writes them: narrowing them (for example making `views` required) breaks the acceptance tests' type check.
2. **Pure.** No I/O, no globals, and input is never mutated (AC-09). Return the source entry objects themselves, not copies with changes.
3. **Order.** `SECTION_ORDER`, then content-file order (AC-02, AC-03). Never iterate `Object.keys(resume)`.
4. **Tagging.** An entry is in view V when `entry.views?.includes(V)` is true. Absent or empty `views` means no view (spec §Definitions).
5. **Errors.** `sectionsForView` throws `Error` naming the value for a non-view (AC-08). `entryTitle` throws `Error` for a non-section key.
6. **No content values in the module** (AC-24). Chrome strings such as section headings and view titles are fine.
7. **Additional exports** (`VIEW_TITLES`, `SECTION_HEADINGS`, `viewPath`, `allowedProfiles` in CV1; `entryDetails` and `showPlaceholder` in CV2) are in the spec's code block too, so they have the same single source. Inner unit tests cover them (test list U5–U7, U26–U34).
