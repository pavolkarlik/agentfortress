[x] 000 - Init repo (Vite React TS) + eslint/prettier + pnpm scripts
[x] 005 - Configure tsconfig path aliases (@sim/@ui/@render/@shared) + required folder skeleton
[x] 010 - Pixi grid renderer + camera pan/zoom + tile picking
[x] 020 - Worker skeleton + Comlink bridge + snapshot streaming
[x] 025 - Fixed-timestep sim loop (20 tps) + tickId command queue application
[x] 030 - Seeded map generator (terrain + passable grid)
[x] 040 - Build tools: road + building placement commands
[x] 050 - ECS-lite world + entity/component storage + serialization
[x] 055 - Stable system execution order + deterministic entity iteration guarantees
[x] 058 - Determinism tests: PRNG seed repeatability + replay hash equality over N ticks
[x] 060 - Pathfinding A* + cache + movement system
[x] 065 - Pathfinding tests: shortest path validity + cache hit/invalidation behavior
[x] 070 - Food production & inventory plumbing (source/warehouse/market)
[x] 080 - Courier bot behavior (policy-driven deliveries) + inspector “why”
[x] 090 - Citizens: hunger + basic trip generation + queues
[x] 095 - Passenger routing rules (home<->market) with walk fallback and stop preference
[x] 100 - Stops + Bus line entity + buses serve queues + fares + upkeep
[x] 105 - Economy ledger + bankruptcy timer (money < 0 for N days) + game-over state
[x] 110 - Maintenance: wear + depot repair + service disruption
[x] 120 - Policy cards framework + bus line auto-scale policy
[x] 125 - Policy cooldown/hysteresis + conflict resolution order + policy unit tests
[x] 130 - Blueprint editor UI + zod validation + apply blueprint to new agents
[x] 140 - Save/Load (IndexedDB) + autosave + export/import blueprints
[x] 145 - SaveBlob versioning + migration scaffold + save/load roundtrip tests
[x] 150 - Overlays: queue heatmap + coverage overlay
[x] 155 - Snapshot payload budget + throttling instrumentation (render snapshot vs details API)
[x] 160 - README: run/build/deploy + GitHub Pages guide
[x] 170 - Onboarding model: walkthrough steps + completion signals
[x] 175 - UI walkthrough panel: progress + next step + static controls tips
[x] 180 - Context-sensitive tips from sim state (money/queues/game-over/snapshot budget)
[x] 185 - Walkthrough dismiss/reset with local persistence
[x] 190 - In-world info bubbles: selected tile/entity + temporary agent action callouts
[x] 195 - Pixel-art entity rendering with per-kind local sprites
[x] 200 - New game reset flow (game-over banner + save panel action)
[x] 205 - Custom in-repo pixel art sprites per entity/building/road kind
[x] 210 - Autonomous expansion director: auto-build core infra + auto-scale citizens/couriers
[x] 215 - Auto-expansion runtime toggle in UI (on/off command to worker)
