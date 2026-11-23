---
threshold: 80
---
Score the **candidate** screenshots out of 100 against `DESIGN.md`. The reference screenshots show the target look: a candidate that looks like them scores high.

**Scope.** Judge only the visual system: type, colour, texture, spacing, density and restraint. Do not judge the content, the wording, which site it is, or its names, logos and branding: brand and privacy rules are checked by other gates, not by you. Do not deduct because a candidate resembles, or even is, the reference. The screenshots are full-page captures cut at 2000px, taken with animations disabled: ignore empty or overlapping regions that are clearly scroll-animation artefacts, and judge the parts that rendered.

Award points in four parts:

1. **Type (30).** An old-style serif carries body text and headings, at a comfortable reading size (about 18 to 22px), with italic serif for display headings. A mono face is used for small labels, navigation, metadata and terminal-style boxes. Deduct for a sans-serif body, system UI fonts for text, heavy bold headings, or more than two type families.
2. **Colour (25).** Warm paper background (off-white with a warm cast, optionally a faint texture or grid), slate ink rather than pure black, links and accents in a muted slate blue. Deduct for a pure white or dark background, saturated or neon accents, purple or indigo, and any gradient used as a colour fill.
3. **Layout and density (25).** Compact and tidy: narrow text columns, justified-feeling text blocks, modest headings, spacing that is generous but not wasteful. Deduct for a landing-page look: a giant headline, a full-bleed coloured banner, large decorative images, rows of feature cards.
4. **Restraint (20).** Nothing from the never list in `DESIGN.md`. Hairline borders and small radii.

How to read the never list:

- **Oversized hero:** a headline above about 48px, or a banner that fills most of the first screen with colour or imagery. A modest centred headline under a small mark is not an oversized hero.
- **Drop-shadow-heavy cards:** large, dark or blurred shadows on cards or many panels. One soft, faint shadow on a single panel is a minor point (deduct at most 5), not a never-list item.
- **Generic card grid:** a grid of similar boxed cards, each with an icon or image, title and blurb.
- **Tailwind defaults:** system sans-serif, grey-on-white, indigo or violet accents, pill buttons, rounded-2xl shadowed cards.
- **Gradients, emoji icons, stock icon sets, purple/indigo accents:** as named.

A clear never-list item caps the score at 60. `passes` is true only when the score is at least 80 **and** no never-list item is present. Name each problem in `issues` with the viewport (390px or 1280px) where you saw it; when the candidate passes, `issues` may hold minor suggestions.
