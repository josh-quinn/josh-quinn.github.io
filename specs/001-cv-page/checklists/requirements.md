# Specification Quality Checklist: CV pages

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-24
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Deliberate exception to "no implementation details": the **View-Selection Contract** (module path, and the exact exported TypeScript signatures and types, which the type-checked acceptance tests compile against) and the **Page Structure Contract** (data attributes, `nav` label, `island` class) are in the spec on purpose. In this repository the test author reads only `spec.md` and the constitution (constitution I, `agents/src/test-author.md`), so the observable test hooks must be stated here. They are interface contracts, not design of the internals. User stories, functional requirements and success criteria stay free of technology.
- The acceptance criteria name the repo's existing test tools (`astro preview`, axe, `tests/privacy/patterns.ts`) because the brief requires those exact checks.
- Validation iteration 1: all items pass. No [NEEDS CLARIFICATION] markers were needed. The controller's rulings settled the open choices (overview content, section order, empty sections, contact, placeholder notice, 404).
