# Alert

Bandeau d'état d'une opération en cours ou terminée : import de pièces, recalcul, relance. Il dit ce qui se passe, ce que l'utilisateur doit faire (ou ne pas faire), et se met à jour en place quand l'opération finit.

- Provide: an icon slot (`.vx-spinner` while running, `.vx-alert__icon--ok` when done, plain `.vx-alert__icon` otherwise), a `.vx-alert__title` in one sentence with the progress ("Import en cours · 2 / 3"), a `.vx-alert__body` with the instruction ("Laissez cet onglet ouvert, sans le rafraîchir") and optional `.vx-alert__actions` (one `.vx-btn-outline` or `.vx-btn-ghost`).
- Tones: `--warn` while the user must not act (running, do not close), `--pos` when finished, `--neg` on failure, default (navy) for neutral information.
- The same element changes tone and text when the operation ends; never stack a second alert under the first, and no toast.
- One alert per panel, placed above the content it concerns.
- The spinner is 16px, tone-coloured, 0.8s; it slows under reduced motion but keeps turning (it is the only cue that work continues).
