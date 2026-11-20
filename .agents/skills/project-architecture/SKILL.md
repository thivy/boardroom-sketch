---
name: project-architecture
description: How this repo is organised and where code belongs. Use when adding or changing a feature, page, server endpoint, API route, client state, a port or adapter, a SQLite store or migration, the meeting-graph pipeline or recording, or the Tauri desktop shell, and when fixing an oxlint import-limit error.
---

# Boardroom Sketch architecture

Read the reference that matches the task. Load only what you need.

| Task | Read |
| --- | --- |
| Add or change a feature, page, endpoint, route, or client state; decide where code belongs | [features.md](references/features.md) |
| Add a port or an adapter; wire an adapter into the app; fix an adapter import-limit error; choose the Copilot model | [ports-and-adapters.md](references/ports-and-adapters.md) |
| Add or change a store, table or migration; split a large store | [storage-sqlite.md](references/storage-sqlite.md) |
| Recording, the graph pipeline, the live switch, "Generate graph", the graph rules | [meeting-graph.md](references/meeting-graph.md) |
| The Tauri shell, the Bun sidecar, dev or build scripts, updates | [desktop-shell.md](references/desktop-shell.md) |

A task often needs more than one. Adding a feature that stores data needs `features.md`, `ports-and-adapters.md` and `storage-sqlite.md`.

## Rules that apply to all of them

- Layers: `apps/web` (routing and wiring) → `packages/features` (client and server per feature) → `packages/contracts` (ports) ← adapters (`teams-cdp`, `copilot-sdk`, `storage-sqlite`). Oxlint enforces the import limits.
- A feature's server never imports an adapter. The app connects them in `apps/web/src/*-handlers.ts`.
- Server handlers and large stores are split into groups of plain functions that a thin `handlers.ts` or `<store>.ts` composes.
- The meeting graph's rules live in `packages/contracts/src/graph-vocabulary.ts`. Change them there, never in an adapter.

For Zustand stores use the `react-state` skill. For ui-sdk components use the `ui-sdk` skill. For colours, cards and wording use `design-guide`.
