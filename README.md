# AGENTWORKS: Nested Tycoon (MVP)

Browser MVP of a transport/tycoon/civ-lite simulation where the authoritative sim runs in a Web Worker and the main thread renders via PixiJS.

## Tech Stack

- Vite + React + TypeScript
- PixiJS renderer (main thread)
- Worker communication: Comlink
- UI state: Zustand
- Validation: zod
- Persistence: idb-keyval (IndexedDB)
- Tests: Vitest

## Requirements

- Node.js 18+
- npm (project was scaffolded with npm in this environment)

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL (usually `http://localhost:5173`).

## Quality Checks

```bash
npm run lint
npm run test
npm run build
```

## Gameplay (Current MVP)

- Deterministic seeded map generation
- Build roads/buildings (`Housing`, `Market`, `Warehouse`, `Depot`, `Food Source`, `Stop`)
- Agent loops:
  - Citizens (needs, trips, market/stop queues)
  - CourierBots (policy-driven food logistics)
  - Minibuses (line service + fares)
- Food loop: source -> warehouse/market -> citizen consumption
- Transit loop: stop queues, boarding, fare income
- Maintenance loop: wear, depot return, repair, service disruption
- Policy cards:
  - Courier delivery rules
  - Bus line auto-scale on sustained high queues
  - Cooldown/hysteresis + deterministic conflict order
- Blueprint editor:
  - Courier/minibus template fields
  - Policy checkboxes
  - zod-validated import/export JSON
- Save/load:
  - Autosave every 60s to IndexedDB
  - Manual save/load buttons
  - Save migration scaffold (`v1/v2 -> v3`)
- Overlays:
  - Queue heatmap
  - Coverage overlay
- Snapshot instrumentation:
  - Payload bytes
  - Budget overrun flag

## Controls

- Mouse wheel: zoom
- Middle mouse or `Space + drag`: pan camera
- Left click tile: select/build using active tool

## Project Layout

```text
src/
  app/      # React shell, store, persistence, worker client
  ui/       # HUD/panels/inspector/blueprints/save UI
  render/   # Pixi renderer + camera/input
  shared/   # Shared types/schemas/constants/rng
  sim/      # Worker-side simulation (world/systems/path/policies/commands)
  styles/
```

## Static Deployment

This project builds to static assets and does not require a backend.

```bash
npm run build
```

Deploy the generated `dist/` directory to Netlify/Vercel/GitHub Pages.

### GitHub Pages (Simple)

1. Build locally: `npm run build`
2. Push `dist/` using your preferred Pages flow (for example `gh-pages` branch).
3. Ensure SPA fallback serves `index.html`.

A minimal GitHub Actions workflow can be added later to automate Pages deploy.

## Art Assets

The renderer uses local pixel-art sprites in `src/render/sprites/`.  
Third-party asset sources and licenses are documented in `ASSETS_ATTRIBUTION.md`.
