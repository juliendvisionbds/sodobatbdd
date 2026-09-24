# DataTable

CSS-grid table inside a Panel: uppercase faint header, hairline rows, mono right-aligned amounts, optional family group labels and expandable rows.

- Provide: column template (name column `minmax(0,2fr+)`, fixed px for numbers), rows, and for expandable rows a detail block (`.vx-detail` with label/value pairs).
- Names 14px (500–600), secondary cells `.vx-cell-muted`, amounts `.vx-cell-amount`, the one key column `.vx-cell-key` in navy. Deltas use `.vx-pos` / `.vx-neg` with an explicit sign; missing values are an em-dash in ink-disabled.
- Wrap in `.vx-table` (overflow-x) with a min-width on the inner grid so the page never scrolls sideways.
- Under the panel, one ink-faint line tells how to use it ("Cliquez sur une ligne… Montants en € HT.").
