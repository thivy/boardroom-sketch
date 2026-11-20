# Meeting graph and recording

## Recording

Recording runs on the server (`packages/features/src/captions/server/recorder.ts`), independent of any browser. The page only follows it. After it saves each caption, the recorder calls the `RecordingObserver` port.

## The graph rules

The graph's vocabulary and rules live in `packages/contracts/src/graph-vocabulary.ts` and are described in `docs/graph-model.md`. Change the rules there, never in an adapter.

## The pipeline

The pipeline is the `graph` feature (`packages/features/src/graph/server`). See `docs/graph-pipeline.md`.

- It follows recordings through the `RecordingObserver` port. The app passes the pipeline in (`apps/web/src/caption-handlers.ts`).
- It is off until the "Build graph live" switch is turned on. The switch uses the `SettingsStore` port. The pipeline asks `enabled()` on every caption, and the graph feature answers from memory.
- The graph feature can also build a graph from a saved transcript on demand (`createGraphBuilder`, the "Generate graph" button). `apps/web/src/routes/transcripts.tsx` puts the button into the transcripts page's `actions` slot, so the captions and graph features never import each other.
- A model only ever proposes changes. Plain code checks quotes and statuses, and the store enforces the graph's rules.
- The model comes from the `StructuredModel` port. See [ports-and-adapters.md](ports-and-adapters.md) for how the Copilot model is chosen.

## Where things are

- Store: `packages/storage-sqlite/src/graph*.ts` (see [storage-sqlite.md](storage-sqlite.md)).
- Server handlers: `packages/features/src/graph/server` (`live-handlers.ts`, `build-handlers.ts`, `graph-handlers.ts`).
- Client: `packages/features/src/graph/client`.
