# AutoFlow Frontend

Next.js 14 (App Router) + TypeScript + Tailwind. Talks to the AutoFlow
NestJS backend over `NEXT_PUBLIC_API_BASE_URL` (defaults to
`http://localhost:4000/api/v1`).

## Getting started

```bash
npm install
cp .env.local.example .env.local
# make sure the backend has CORS_ORIGIN=http://localhost:3000 in its .env
npm run dev
```

Then: sign up → land on `/workflows` → "New workflow" → wire up steps on
the canvas → Save → Run → watch it live on the run page.

## What's here

- `app/login`, `app/signup` — auth
- `app/workflows` — dashboard (list, run, duplicate, delete)
- `app/workflows/new`, `app/workflows/[id]` — the visual builder
- `app/workflows/[id]/runs` — run history for a workflow
- `app/runs/[id]` — live run view: read-only canvas with per-step status,
  action log console, and the intervention panel (OTP / manual takeover)
  when a run is paused. Polls every 2s while the run is active.
- `components/canvas/` — the "wired connectors" canvas. Steps lay out in
  a serpentine grid (4 per row) connected by right-angle traces, closer
  to a circuit diagram than a generic flowchart — a deliberate nod to
  what this product actually does (wire up browser actions).
- `lib/api.ts` — fetch wrapper, attaches the JWT, redirects to `/login`
  on a 401.

## Design system

Dark ink background (`#0F1419`) with a faint blueprint grid, amber
"signal" accent (`#E8A33D`) for anything live/active, teal for success,
warm red for failure. Space Grotesk for headings, Inter for body copy,
JetBrains Mono for selectors/logs/anything that's actually data. Tokens
live in `tailwind.config.ts`.

## Important: this UI matches what the backend can do *today*

A few things are visible in the UI as deliberate limitations, not bugs:

- **Steps are a straight line, not a branching graph.** The canvas
  supports adding/editing/deleting/reordering steps, but there's no
  if/else or parallel-path authoring — the backend's `Workflow.steps` is
  an ordered array, and the `condition` step type is a presence-check
  stub server-side. If you add real branching to the backend (nodes +
  edges, multiple next-steps), the canvas will need a real graph layout
  (positions, curved/multi-target edges) instead of the current
  serpentine-grid layout, which assumes one path.
- **Scheduled/Webhook triggers are selectable but labeled "not wired up
  yet"** in the trigger dropdown — the backend only executes on manual
  trigger right now (no cron scheduler, no webhook receiver).
- **Live browser view is a JPEG screencast, not real video.** The "Live"
  tab in `app/runs/[id]` connects to the backend's `/live-view` WebSocket
  (`components/LiveBrowserView.tsx`) and renders whatever frame the CDP
  screencast last pushed — it's a live still-image feed, not an encoded
  video stream, and only runs while the backend's Playwright browser for
  that run is actually open.
- **Credential picker isn't in the builder.** The vault API
  (`/credentials`) exists but nothing in the execution engine consumes
  it yet, so there's no "use these saved credentials" step field.

None of these block using the app for linear, manually-triggered
automations end to end — they're just the seams to be aware of before
extending either side.
