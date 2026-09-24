# KpiCard

A headline figure: label (ink-muted 13/600), value in `kpi-value`, one context line.

- Provide: label, value already formatted (k€ / M€ with a French comma, `%` with a thin space), and a sub-line that gives the comparison or the count behind it.
- Sub-line is ink-faint by default; positive or negative only when it states a change.
- Four per row in `.vx-kpis` (minmax 230px); five in the monthly view with `kpi-value-sm`.
