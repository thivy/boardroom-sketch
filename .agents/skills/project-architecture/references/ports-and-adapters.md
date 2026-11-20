# Ports and adapters

A feature depends on a port, which is a type in `packages/contracts`. An adapter package implements it. The app connects the two.

## Packages

- `packages/contracts` holds the types shared by client, server and adapters. It includes the ports: `CaptionSource`, `TranscriptStore`, `GraphStore`, `PipelineLog`, `SettingsStore`, `WorkspaceStore`, `ChatStatus`/`CreateChatSession` and `StructuredModel`.
- `packages/teams-cdp` implements `CaptionSource` over the Chrome DevTools Protocol.
- `packages/storage-sqlite` implements the stores. See [storage-sqlite.md](storage-sqlite.md).
- `packages/copilot-sdk` implements the chat (`GetChatStatus`, `CreateChatSession`) and `StructuredModel` ports with the GitHub Copilot SDK.

## Rules (oxlint enforces the import limits)

- An adapter must not import `@app/features`, `@app/ui`, React or a web framework. This applies to `teams-cdp`, `storage-sqlite` and `copilot-sdk`.
- A feature's server must not import an adapter. The app wires it in one file: `apps/web/src/caption-handlers.ts` (teams-cdp and the stores), `chat-handlers.ts` and `graph-handlers.ts` (copilot-sdk), `workspace-handlers.ts` (the workspace store).
- `apps/web` is not allowed to import `@app/contracts`, `node:*` or the Copilot SDK in its route files. Only the `*-handlers.ts` wiring files and `storage.ts` connect adapters.
- To swap an adapter, change the one wiring line. Nothing in `packages/features` should change.

## Copilot SDK

- The SDK stays external in the production build (`apps/web/vite.config.ts`) because it resolves its runtime package at run time. It is a dependency of `apps/web` and of the root package.
- Models: the adapters take no environment variables. The graph model comes from `PREFERRED` in `packages/copilot-sdk/src/model.ts`, or from `copilotModel({ model })`. The runtime's automatic choice returns placeholder JSON for the graph prompts, so keep an explicit model.

## Adding a port

1. Put the type in `packages/contracts/src` and export it from `index.ts`.
2. Implement it in an adapter package.
3. Take it as an argument in the feature's `createXHandlers(...)`.
4. Connect it in an `apps/web/src/*-handlers.ts` file.
