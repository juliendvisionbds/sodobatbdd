# Chat

The "Assistant IA" tab: a Panel-style thread where the AI answers from the same data as the other tabs, with figures as key/value lines.

- Provide: a header title + LiveStatus, messages (user right on white, AI left on navy-tint), and a composer (search-style input + primary "Envoyer"). Enter sends.
- AI messages: one sentence of answer, then `.vx-bubble__line` rows (label in ink-muted, value in mono navy-deep; warning for surcharges), then an italic tail naming the source invoices or the caveat.
- The first AI message states what it is connected to and the scope (dates, counts), and invites a question.
- While waiting: an AI bubble reading "Lecture de la base…". Pair with SuggestionCard in a 300px side column.
