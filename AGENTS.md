You are a senior TypeScript web game engineer. Build an MVP of the game “AGENTWORKS: Nested Tycoon” (a transport/tycoon/civ-lite agent-based world sim) for the browser.

See TASKLIST.md for tasks and update them appropriately as you go. If you encounter huge problem, just stop and ask me, otherwise work fully antonomously.

NON-NEGOTIABLES
- Target platform: modern browsers (desktop-first). No backend required for MVP.
- Must be deployable as a static site (e.g., GitHub Pages/Netlify/Vercel static).
- Use TypeScript.
- Keep the UI responsive: run simulation in a Web Worker.
- Rendering must be fast: Canvas/WebGL via a game renderer library (choose PixiJS).
- Must implement the core “agents are systems” structure (modular components, policies).
- Deterministic simulation given same seed + same player commands.
- Save/load locally (IndexedDB) and allow blueprint export/import as JSON.

TECH STACK (choose and stick to this)
- Build tool: Vite + React + TypeScript
- Renderer: PixiJS (WebGL/canvas fallback)
- Worker comms: Comlink
- State: Zustand (UI state only; sim state lives in worker)
- Validation: zod for blueprint JSON validation
- Persistence: idb-keyval (or similar tiny IndexedDB helper)
- Testing: Vitest for unit tests; Playwright smoke test optional

DELIVERABLES
1) A running MVP in the browser with:
   - Procedural map generation (simple, deterministic from seed)
   - Roads placement + basic buildings placement
   - Agents: Citizens, CourierBots, Minibuses
   - Goods: Food (single good is enough for MVP)
   - Buildings: Housing, Market, Warehouse, Depot, Food Source (Farm/Port)
   - Lines: “Bus Line” entity that owns stops + assigned buses
   - Basic economy: buildings have upkeep; lines earn fares; player can go bankrupt
   - Policy Cards (simple rules) to control bot behavior and line scaling
   - Inspector UI that explains “why” an agent is doing something
   - Overlays: congestion/coverage/happiness (basic versions)
   - Save/Load game; Export/Import blueprint JSON

2) A clean repo with:
   - README explaining how to run, build, and deploy
   - Clear separation: /sim (worker) vs /ui vs /render
   - Minimal dependencies; keep code understandable

DO NOT ASK THE USER QUESTIONS unless absolutely blocked.
Make reasonable assumptions and proceed. Keep scope MVP-sized.

================================================================================
PROJECT SETUP

1) Bootstrap
- Create Vite React TS project: `pnpm create vite agentworks --template react-ts`
- Add deps:
  - pixi.js, comlink, zustand, zod, idb-keyval, lz-string (for share links)
- Add dev deps:
  - eslint, prettier, vitest, @vitest/coverage-v8, typescript
- Configure:
  - ESLint + Prettier
  - Vite worker support (use `new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' })`)
  - Path aliases: @sim, @ui, @render, @shared

2) Repo structure (must match)
src/
  app/                 React app shell
  ui/                  Panels, HUD, inspector, blueprint editor
  render/              Pixi renderer, camera, input mapping
  shared/              Shared types, zod schemas, rng, math, serialization
  sim/                 Worker-side simulation (NO DOM, no Pixi)
    worker.ts
    world/
    systems/
    path/
    policies/
    commands/
  styles/
public/
README.md

================================================================================
CORE ARCHITECTURE

SIMULATION IN WORKER
- The worker owns authoritative state.
- The main thread sends player commands (build road, place building, set policy).
- The worker steps on a fixed timestep (e.g., 20 ticks/sec).
- The worker emits snapshots/deltas to the main thread at a throttled rate (e.g., 5–10 fps) to render and update UI.

DETERMINISM
- Use a seeded PRNG (implement Mulberry32).
- Sim tick order must be stable.
- Commands must be applied at specific ticks (include tickId in command).
- Save files must include seed + tick + full sim state required to resume.

DATA MODEL (ECS-LITE)
- Implement a simple ECS:
  - EntityId: number
  - Components stored as Map<EntityId, ComponentType> or arrays if easy
  - Systems iterate stable entity lists
- REQUIRED COMPONENTS for MVP:
  - Position {x,y}
  - Velocity / Movement {speed, path?}
  - Inventory {food:number}
  - Needs {hunger:0..1, happiness:0..1}
  - Wallet {money:number}
  - Building {kind, footprint, upkeep}
  - Road {kind}
  - AgentKind {Citizen|Courier|Minibus}
  - Policy {policyIds[] or compiled policy graph}
  - Ownership {ownerEntityId?} (for Company/Line later)
  - Line {stops:[], assignedVehicles:[], fare, headwayTarget}
  - Queue {count} (at stops/markets)
  - Condition {wear:0..1} (for vehicles maintenance)
  - SystemAgent {children:EntityId[]} (scaffolding for nesting)

SYSTEMS (MVP SYSTEM LIST)
- TimeSystem: tick/time-of-day/season stub
- NeedsSystem: citizens hunger increases; happiness influenced by wait times
- EconomySystem: upkeep costs, fares, basic income/expense
- ProductionSystem: food sources produce food into inventory
- LogisticsSystem: courier bots move food from sources -> warehouse/market
- PassengerSystem: citizens decide trips (home <-> market) with simple heuristics
- TransitSystem: buses serve stops; queues grow/shrink; collect fares
- MovementSystem: path-following on roads grid
- PathfindingSystem: A* on grid with cached results
- MaintenanceSystem: wear increases; if threshold then return to depot
- PolicySystem: evaluate policy cards and produce actions
- AggregationSystem (stub): enable creating a SystemAgent wrapper (minimal)

================================================================================
WORKER <-> UI API (Comlink)

Define a typed interface:
- init(config: {seed:number, mapSize:{w,h}}): void
- step(untilTick:number): void  (worker can self-step too, but keep an explicit API)
- enqueueCommands(cmds: SimCommand[]): void
- getSnapshot(): SimSnapshot  (used on init/load)
- save(): SaveBlob
- load(blob: SaveBlob): void

Recommended pattern:
- Worker runs its own loop with setInterval or requestAnimationFrame-like timer (in worker).
- UI subscribes to snapshot updates via Comlink callback:
  - onSnapshot((snap) => {store.setState(...)})
  - Send snapshots 5–10x/sec to reduce overhead.

SNAPSHOT CONTENT (keep minimal)
- tick, money, key counters
- visible entities only (optional optimization later); for MVP send all but keep size reasonable
- arrays of renderable items:
  - roads list
  - buildings list
  - agents list (pos + kind + a few status fields)
  - stop queues
- selected entity details can be fetched by a separate call:
  - getEntityDetails(entityId)

================================================================================
RENDERING (PixiJS)

- Use a single Pixi Application in main thread.
- Render layers:
  - Terrain layer (simple colored tiles)
  - Roads layer
  - Buildings layer
  - Agents layer
  - Debug/overlay layer
- Camera:
  - pan with middle mouse / space+drag
  - zoom with mouse wheel
  - world<->screen transform utilities
- Input:
  - pointer picking by tile coordinate (grid-based selection)
  - tool modes: Select, BuildRoad, PlaceBuilding, PlaceStop
- Keep Pixi display objects pooled/reused (avoid recreate every frame).

================================================================================
UI (React)

Panels:
- Top HUD: money, population, food stock, happiness, alerts
- Build Palette: roads + buildings + stops
- Inspector: selected entity details + “why” explanation + policy list
- Blueprint Editor (MVP):
  - Define blueprints for CourierBot and Minibus
  - Editable fields: speed, capacity, wear rate, maintenance threshold
  - Policy cards: choose from a small set (checkbox list)
  - Save blueprint; apply to newly built agents

Explainability (“WHY”)
- Each agent keeps a small rolling “decision log”:
  - lastDecision: string
  - lastReason: string
  - lastTarget: entityId/tile
- Inspector displays these fields.

================================================================================
POLICY CARDS (MVP IMPLEMENTATION)

Implement policy cards as declarative rules:
- Condition -> Action with optional cooldown.
Example cards:
1) Courier: “If Market.food < 20 then deliver food to Market”
2) Courier: “If Warehouse.food > 50 then deliver from Warehouse to Market”
3) Bus Line: “If avgQueueAtStops > 15 for 60s then add bus”
4) Vehicle: “If wear > 0.7 then go to nearest depot”
5) Citizen: “If hunger > 0.7 then travel to market”

Implementation:
- Define card schemas in shared/
- Compile cards into small runtime functions in worker (no eval).
- Evaluate on intervals (every N ticks) to reduce CPU.

================================================================================
SAVE/LOAD + SHARING

SaveBlob (JSON):
- version
- seed
- tick
- map data
- entities + components
- player money
- blueprints

Store in IndexedDB using idb-keyval:
- autosave every 60s
- manual save/load

Blueprint export/import:
- blueprint JSON validated with zod
- provide “Copy to clipboard” and “Import from clipboard/file”

Share links (optional but nice):
- compress JSON with lz-string and put in URL hash:
  - #b64=<compressed>
- On load, parse hash and import blueprint pack or scenario seed.

================================================================================
MVP GAMEPLAY REQUIREMENTS (ACCEPTANCE CRITERIA)

- Player can place roads and buildings; agents navigate on roads.
- Food is produced and delivered; citizens consume it; shortages reduce happiness.
- Citizens generate trips and form queues at stops/market.
- A bus line can be created with stops; buses serve them; fares earn money.
- Maintenance triggers bus return to depot; broken service increases queues.
- Policies can auto-add a bus when queues are high.
- Bankruptcy condition exists (money < 0 for N days) and ends game.
- Inspector reliably answers:
  - what the entity is doing
  - why it chose that action
  - what it needs (e.g., “needs food”, “needs maintenance”)

================================================================================
MILESTONES (IMPLEMENT IN ORDER)

Milestone 0: Foundation
- Repo boots, linting, formatting
- Pixi renders a grid and camera works
- Worker starts, seeded map generated, snapshot displayed

Milestone 1: Build/Place
- Place roads and buildings
- Save/load map state
- Basic selection + inspector shows type and stats

Milestone 2: Movement + Pathfinding
- A* grid pathing on roads
- Agents move reliably; path caching

Milestone 3: Food Loop
- Food source produces -> courier delivers -> market stocks -> citizens consume
- Needs/happiness changes visible

Milestone 4: Transit Loop
- Create stops + bus line
- Buses pick up from stop queues, drop off at market/home area
- Fares + costs tracked

Milestone 5: Policies + Blueprint Editor
- Policy cards working (courier and bus line)
- Blueprint editor for courier/bus templates
- Import/export blueprint JSON

Milestone 6: Polish + Deploy
- Overlays (coverage/queue heatmap)
- Autosave
- Build `npm run build` and publish instructions in README
- Optional GitHub Pages workflow

================================================================================
CODING RULES

- Keep simulation pure: no random calls outside the PRNG.
- No DOM in worker.
- Type everything; no `any`.
- Keep functions small; document systems and data flow.
- Add unit tests for PRNG determinism, pathfinding, policy evaluation.
- Prefer clarity over premature optimization, but avoid O(N^2) where easy.

END.