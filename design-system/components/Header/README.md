# Header

Sticky white app bar: client logo tile, product name and scope, the signed-in role, and the view tabs underneath.

- Provide: two client initials for `.vx-logo`, the product name (`app-title`), one scope line (company · period), a role chip (`.vx-avatar` initials + role + either an access line in `ink-faint` or a `.vx-live` status), and 2–4 tabs.
- Tabs are `.vx-tab` buttons; the current one carries `aria-selected="true"` (navy fill, white text). The last tab is always the AI assistant ("Assistant IA").
- Content sits in `.vx-wrap` (max 1180px, 28px gutter). One header per page, `border-bottom: 1px solid border`, no shadow.
- Don't put actions or search in the header; they belong to the panel they act on.
