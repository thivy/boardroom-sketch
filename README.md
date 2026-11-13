# Boardroom Sketch

A [Bun](https://bun.sh) workspaces monorepo: a thin [TanStack Start](https://tanstack.com/start) app with an app shell (sidebar, header, theme toggle).

```
apps/web             TanStack Start app: root route and page routes. Nothing else.
packages/features    One folder per feature: `app-shell` (sidebar layout) and `app-header`.
packages/components  shadcn components, `cn()` helper and the Tailwind theme (`styles.css`).
packages/contracts   Types shared by client, server and adapters, including the `CaptionSource` port.
packages/teams-cdp   Interim `CaptionSource` that reads Teams captions over the Chrome DevTools Protocol.
packages/transcripts-sqlite  `TranscriptStore` that keeps transcripts in a SQLite file (`node:sqlite`).
```

Dependency direction: `web` → `features`, `components`, `teams-cdp`, `transcripts-sqlite`; `features` → `components`, `contracts`; the two adapters → `contracts`. The captions feature knows only the `CaptionSource` and `TranscriptStore` ports; the app wires the adapter in `apps/web/src/caption-handlers.ts` (see [`packages/features/CAPTIONS.md`](packages/features/CAPTIONS.md) and [`packages/teams-cdp`](packages/teams-cdp/README.md)).
Server state on the client goes through [TanStack Query](https://tanstack.com/query): `apps/web/src/router.tsx` creates a `QueryClient` per request and connects it to the router for server rendering.

Packages ship TypeScript source (`exports` point at `src/`); Vite compiles them as part of the app graph.

## Teams captions

The **Teams captions** page reads live captions from a Teams meeting you have open in Chrome (or Edge), through the Chrome DevTools Protocol:

1. **Teams desktop (new Teams, Windows):** click **Restart Teams** on the page. It quits Teams and relaunches it with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, then waits for DevTools. **Or a browser:** start it with remote debugging on a separate profile: `chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\chrome-teams`.
2. Join the meeting and turn on **Live captions** (More > Language and speech).
3. Open the app, choose **Teams captions**, click **Find meetings**, then **Start recording**. Captions stream in and are saved as they arrive.

## Transcripts

Recording happens on the server, not in the page: **Start recording** creates a _session_ for the meeting and the server saves every caption line to SQLite until you click **Stop recording** or the meeting ends. Closing or reloading the page does not stop it; coming back to **Teams captions** picks the running recording up again. The **Transcripts** page lists meetings and their sessions, shows a transcript, exports it as `txt`, `md` or `json`, and deletes a session (not while it is recording).

The database is `./data/transcripts.db` (relative to where the server runs; git-ignored). Set `TRANSCRIPTS_DB` to use another file. It has `meetings`, `sessions`, `speakers` and `captions` tables (schema and migrations in `packages/transcripts-sqlite/src/schema.ts`). A session left open by a crash is closed at its last caption on the next start.

The adapter only talks to DevTools on `127.0.0.1` (port from `TEAMS_CDP_PORT`, default 9222). Restarting Teams ends any meeting you are in. It reads the caption elements of the Teams web client, so a Teams UI change can break it; the selectors are in `packages/teams-cdp/src/observer-script.ts`. Needs Node 22+ (global `WebSocket`).

## Run without cloning

```bash
npx boardroom-sketch            # or: bunx boardroom-sketch
npx boardroom-sketch --port 8080
```

Needs Node 22.13+. The package ships the prebuilt server, so nothing is installed or built on first run.

## Publishing

```bash
npm login
npm version patch      # or minor / major
npm publish
```

`prepack` builds the app before the tarball is created; check the contents first with `npm pack --dry-run`.

## Getting started

```bash
bun install
bun run dev        # http://localhost:3000
```

bun run dev # http://localhost:3000

```

## Scripts

| Command             | What it does                       |
| ------------------- | ---------------------------------- |
| `bun run dev`       | Start the Vite dev server          |
| `bun run build`     | Production build of `apps/web`     |
| `bun run start`     | Serve the production build (Nitro) |
| `bun run typecheck` | Typecheck every workspace          |
| `bun run lint`      | oxlint                             |
| `bun run fmt`       | oxfmt (`fmt:check` to verify)      |
| `bun test`          | Run package tests (`bun:test`)     |

```
