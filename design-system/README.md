The look of the Vision client demos for construction companies (BTP): a price database built from invoices and a one-screen financial analysis. Data-dense, calm, navy on light grey, borders instead of shadows. Every screen answers one question a director or a site manager already asks, with figures pulled from their own documents.

## Content fundamentals

- Write in French, addressed to the client with *vous*. Plain and factual; no exclamation marks, no emoji, no superlatives.
- Page titles are short full sentences ending with a period: "L'exercice en un écran.", "Le prix juste, déjà calculé.", "Chaque chantier, ligne par ligne.", "Demandez comme à un métreur."
- Leads name what the tool replaces (the four hours of spreadsheet, the métreur's estimate, the Excel table) and what now happens automatically.
- Speak the trade's words: ouvrage, chantier, zone, travaux normaux / supplémentaires (TS), avoir, exercice, N-1, conducteur de travaux, prix modal ("le + donné").
- Every claim carries its number and its source: "Sept signaux sortis des données. Personne n'a eu à les chercher.", "Basé sur les factures des chantiers …".
- Numbers in French format: space as thousands separator, comma decimals, `€` and `%` after a space (`1 248 530 €`, `24,1 %`). Large amounts as `k€` / `M€`. Always sign deltas (`+184 k€`, `-73,1 %`). Dates `DD/MM/YYYY`; arrows for ranges (`01/11/2024 → 31/10/2025`, `312 k€ → 84 k€`).
- Confirm an action by changing its own label ("Import terminé ✓"), not with a toast.

## Visual foundations

**Colour.** Neutral-first. The page is `canvas`, every section a `surface` panel with a 1px `border`; rows split on `hairline`. `navy` is the only brand hue: logo tile, avatar, selected tab/chip, primary button, key figures, chart fills. `navy-tint` marks anything the system is saying to you (sync banner, AI bubbles, info insights, expanded rows). Signals are reserved for meaning: `positive` for gains, `negative` for losses and threshold breaches, `warning` for vigilance and TS lines, each with its own `-bg` / `-border` pair for insight cards. `live` is only the connected-status dot.

**Contrast.** `ink` and `ink-muted` pass 4.5:1 on every ground used. `ink-faint` (#868E93) is 3.33:1 on `surface` and fails on `canvas`; it is kept exactly from the source, so use it only for meta that the reader can skip (column headers, hints, sub-lines), never for data. `positive` and `negative` are close in lightness, so a delta always shows its sign.

**Type.** Three families. `Space Grotesk` 700 (display) for titles and every headline figure; `IBM Plex Sans` (sans) for all text, 15px base, 1.55 line height; `IBM Plex Mono` (mono) for amounts, prices, dates and invoice numbers in tables and charts. Use the styles as named: `page-title` once per view, `panel-title` per panel, `kpi-value` for figures, `kicker` / `group-label` for uppercase labels (letter-spacing .04em / .08em), `amount` / `amount-key` for table numbers.

**Layout.** One centred column, `content-width` 1180px, `space-28` gutter (16px on phones). Order of a view: PageHeading → KPI row (4 cards, `space-16` gap) → insights panel → charts and lists in two-column grids (`minmax(330px,1fr)`) → the full table last. `space-22` between panels, `space-24` inside them. Summary before detail, always.

**Shape.** Radii are small and exact: `radius-12` panels and KPI cards, `radius-10` insight cards and detail panels, `radius-9` fields and primary buttons, `radius-8` tabs and outline buttons, `radius-pill` chips, rails and badges. No shadows (`shadow-none`), no gradients.

**Charts.** Flat navy marks. Bars: `navy` above the average, `navy-soft` below, value in mono above each bar, no gridlines. Shares: 7px `track` rails with a `navy` fill that turns `negative` past the threshold. Say the encoding in the panel meta line.

**Motion.** Only two: the 2.2s opacity pulse on live dots, and a 0.15s chevron rotation when a row expands. Both stop under reduced motion.

**States.** Hover on outline controls: `navy` border on `navy-tint`. Focus: 2px solid `navy` ring, 2px offset. Selected: navy fill with `on-navy` text (tabs, chips) or white with navy text (segmented control).

## Iconography

No icon set. The demos use only CSS dots (8px, tone-coloured), the `▸` chevron for expandable rows, `→` for ranges and `✓` for confirmations. The logo is two client initials in `logo-initials` on a 46px `navy` tile with `radius-9`; there is no Vision mark in the sources.

## Using the components

Components are CSS classes in `components/bundle.css` (prefix `vx-`), which also loads the three Google Fonts. Wrap a page in `.vx-app` and content in `.vx-wrap`. There is no JS bundle: tabs, chips and expanding rows toggle `aria-selected`, `aria-pressed` and `aria-expanded`, and the CSS follows those attributes.
