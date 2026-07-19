# Website brief — AWAITING DAN'S TASK DESCRIPTION

Dan will describe the website task here (or in chat — then this file gets filled in).
The site will be hosted on **Railway** from this GitHub repo.

## Questions to answer when the task arrives

1. **What is the website?** (Content-engine dashboard? Landing page for Kokoro content?
   Internal review tool for approving generated carousels? Something else?)
2. **Who uses it?** (Just Dan? Public?)
3. **Core screens/flows** — what must exist on day one?
4. **Does it need the OpenAI generation pipeline server-side?** (If yes: key goes in
   Railway variables, and we port the PowerShell scripts to Node.)
5. **Auth?** (If it's an internal tool, even a simple password gate matters before hosting.)
6. **Design direction** — Kokoro-adjacent (japanese minimal, dusk palette) or neutral?

## Pre-made decisions to lean on

- Stack default unless Dan says otherwise: **Next.js (React) + Tailwind**, deployed on
  Railway. Skills installed for exactly this: `frontend-design`, `ui-ux-pro-max`,
  `design-taste-frontend`, `vercel-react-best-practices`, `use-railway`, `gsd`.
- For project management of the build: use the `gsd` skill (`/gsd:new-project`) once the
  brief is filled in.
