# InsightCard

A signal the data surfaced on its own: tinted card with a dot + uppercase kicker, a one-line finding and one line of evidence.

- Tones: `--pos` Bonne nouvelle, `--neg` À surveiller, `--warn` Vigilance, default (navy) Repère, `--obs` Constat. The kicker defaults to that word; replace it with the topic (Nouveaux, Dormants, Avoirs, Dépendance, Décrochage, Écart de zone).
- Title states the finding with its number ("CA en baisse de -26 % vs le mois précédent"). Body gives the figures behind it: before → after, the biggest case, the threshold.
- 4 to 7 cards in `.vx-insights` inside a Panel titled "Ce qu'il faut regarder ce mois-ci" or "Ce que la base sait déjà".
