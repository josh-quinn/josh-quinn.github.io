# Contract: CV routes and page structure

This restates the spec's routes and Page Structure Contract as the outline each page follows. The spec is authoritative.

## Routes (built files)

| Route | File | Built by |
|---|---|---|
| `/cv/` | `dist/cv/index.html` | CV3 (`src/pages/cv/index.astro`) |
| `/cv/engineering/`, `/cv/ocean/`, `/cv/life/` | `dist/cv/<view>/index.html` | CV2 (`src/pages/cv/[view].astro`) |
| any other path, including `/cv/foo/` | `dist/404.html`, status 404 | CV2 (`src/pages/404.astro`) |

No other HTML is built under `dist/cv/` (AC-18).

## Overview outline (`/cv/`)

```text
<html lang="en">  <title>CV · {basics.name}</title>  <meta name="description" …>
main.page
  [data-cv-placeholder].label        "Sample content"   (only if meta.placeholder === true)
  .label                              "CV"
  h1                                  {basics.name}
  p                                   {basics.label}
  p                                   {basics.summary}
  section.island  (facts)             Location {basics.location.region}; profile links
  nav[aria-label="CV views"]          a×3 → /cv/engineering/ /cv/ocean/ /cv/life/  (no aria-current)
  section[data-cv-section="skills"]   h2 "Skills"; [data-cv-entry] × every skill (h3 name; ul > li keywords)
```

## View outline (`/cv/<view>/`)

```text
<html lang="en">  <title>{View title} CV · {basics.name}</title>  <meta name="description" …>
main.page
  [data-cv-placeholder].label        "Sample content"   (only if meta.placeholder === true)
  .label                              {basics.name} · {basics.label}   (name and label shown)
  h1                                  {View title}
  nav[aria-label="CV views"]          a×3, current one aria-current="page"
  a[href="/cv/"]                      "CV overview"     (added by CV3, AC-17)
  section[data-cv-section="<key>"]    for each non-empty section, in SECTION_ORDER
    h2                                {section heading}
    [data-cv-entry] × entries         h3 {primary field}; shown fields; ul > li per highlight/keyword
  [data-cv-empty]                     "Nothing listed for this view yet."   (only when no sections)
  footer / island                     profile links (allowed profiles only)
```

## 404 outline

```text
<html lang="en">  <title>Page not found</title>  <meta name="description" …>
main.page
  .label  "404"
  h1      "Page not found"
  p       short line; a[href="/"] home
```

No placeholder notice, no profile links, no off-site links (AC-35, AC-36).

## Common rules

- No `<script>`, no `on*` attributes, no `javascript:` (AC-31).
- At most two `.island` per page; at least one on `/cv/` (AC-38).
- The layout and visual details (spacing, which facts sit in the island, label wording other than the strings above) are the design phase's to settle. The hooks, texts and order above are fixed by the spec.
