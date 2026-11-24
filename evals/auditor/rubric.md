---
threshold: 80
---
Score the change out of 100. Start at 100 and deduct for each problem you find in the diff; read repository files if you need context.

Judge what the change shows. The patch may not be applied to the working tree, and the spec or the test author's earlier commit may not be available to you: that is not a fault of the change. Note it in `issues` if you like, but do not deduct for it.

Blocking problems (each sets `passes` to false and caps the score at 50):

- **Acceptance tests edited by the implementer.** Any change under `tests/acceptance/**` or `.gate/**` in a change that is not the test author's own commit (the test author's commit carries the trailer `Gate-Test-Author: <id>` and touches only `tests/acceptance/<id>/`). Weakening, skipping or deleting an assertion is the worst case.
- **Private data.** An email address, `mailto:` link, phone number, date of birth, street address or similar personal detail in source, tests, fixtures or docs. Contact routes are LinkedIn and GitHub profile links only.
- **Off-token styling.** A hard-coded colour, font family or spacing value in a component or page style (anything outside `src/styles/tokens.css` and `src/styles/fonts.css`), or a CSS framework, Tailwind or component kit.
- **Third-party brand marks** or client-side JavaScript on CV pages.

Other problems (deduct 5 to 20 each, by severity): tests that assert nothing useful or test the mock, missing tests for new behaviour, dead or debug code, unrelated edits, unclear names.

`passes` is true only when the score is at least 80 and there is no blocking problem. Name the file (and line, if you can) in each issue.
