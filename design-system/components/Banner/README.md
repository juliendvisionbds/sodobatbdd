# Banner

Full-width navy-tint strip under the header that states where the data comes from and when it was last refreshed.

- Provide: one sentence with the source in bold (`journal des ventes`, `Mise à jour en temps réel`), counts and the next or last update; one `.vx-btn-ghost` action.
- The dot pulses when the source is live; it stays still for a scheduled import.
- After the action runs, the button label confirms in place ("Import terminé ✓", "Flux vérifié ✓"). No toast.
- One banner per page, never stacked.
