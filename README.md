# Boardroom Sketch

A [Bun](https://bun.sh) workspaces monorepo: a thin [TanStack Start](https://tanstack.com/start) app with an app shell (sidebar, header, theme toggle).

```
apps/web             TanStack Start app: root route and page routes. Nothing else.
packages/features    One folder per feature: `app-shell` (sidebar layout) and `app-header`.
apps/desktop         Tauri shell: a native window on the web app, which runs as a bundled Node sidecar.
packages/components  shadcn components, `cn()` helper and the Tailwind theme (`styles.css`).
packages/contracts   Types shared by client, server and adapters, including the `CaptionSource` port.
packages/teams-cdp   Interim `CaptionSource` that reads Teams captions over the Chrome DevTools Protocol.
packages/copilot-sdk       `ChatBackend` that answers through the GitHub Copilot SDK.
packages/transcripts-sqlite  `TranscriptStore` that keeps transcripts in a SQLite file (`node:sqlite`).
```

Dependency direction: `web` → `features`, `components`, `teams-cdp`, `transcripts-sqlite`, `copilot-sdk`; `features` → `components`, `contracts`; the two adapters → `contracts`. The captions and chat features know only the `CaptionSource`, `TranscriptStore` and `ChatBackend` ports; the app wires the adapters in `apps/web/src/caption-handlers.ts` and `chat-handlers.ts` (see [`packages/features/CAPTIONS.md`](packages/features/CAPTIONS.md) and [`packages/teams-cdp`](packages/teams-cdp/README.md)).
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

## Analysis chat

The **Analysis chat** page is a chat window backed by the [GitHub Copilot SDK](https://www.npmjs.com/package/@github/copilot-sdk). Optionally pick a saved transcript first and the assistant answers from it (summaries, action items, decisions); the choice is fixed for that chat, so use **New chat** to switch.

It uses the account the machine is signed in with: run `gh auth login` (or set `COPILOT_GITHUB_TOKEN`). The page shows the account, or why it cannot be used. Set `COPILOT_MODEL` to pick a model; otherwise the runtime chooses. Requests count against that account's Copilot usage.

The assistant is a chat, not an agent: shell, file and MCP tools are switched off and permission requests are refused. A conversation lives on the server (up to 20, closed after 30 idle minutes or with **New chat**), and a transcript longer than 300,000 characters is cut. Answers are shown as plain text.

The SDK is not bundled into the server build: it finds its runtime in a platform package (about 190 MB) at run time, so it is a dependency of the published package and installed with it.

## Desktop app (Tauri)

`apps/desktop` wraps the app in a native window. The app needs its server (it talks to Teams over CDP, keeps transcripts in SQLite and calls the Copilot SDK), so Tauri ships the built server as a resource and starts it with a bundled Node binary (a sidecar) on a free local port. The window loads it from `127.0.0.1`, and the sidecar stops when the app closes.

- Transcripts are kept in the app data folder (`%APPDATA%\dev.thivy.boardroomsketch\transcripts.db` on Windows), not where the app was started from.
- The Copilot SDK is not bundled into the server, so `prepare-sidecar` installs it next to the server. That brings its runtime package, which makes the installer large (about 200 MB).
- The sidecar is a copy of the Node that runs the build, so build on the OS you are targeting.

Needs [Rust](https://rustup.rs) and, on Windows, the Visual Studio C++ Build Tools plus WebView2 (included in Windows 11). Open a new terminal after installing Rust so it is on the PATH.

```bash
bun run desktop:dev     # builds the web app, prepares the sidecar, opens the window
bun run desktop:build   # produces an installer under apps/desktop/src-tauri/target/release/bundle
```

Dev runs the production server build, so run `desktop:dev` again after changing web code; use `bun run dev` for hot reload in a browser.

### Download a build from GitHub

The `Desktop app` workflow (`.github/workflows/desktop.yml`) builds the installers for Windows (`.msi`, `.exe`), macOS (`.dmg`) and Linux (`.deb`, `.rpm`, `.AppImage`).

- **Any commit:** Actions → _Desktop app_ → _Run workflow_, then download the installers from the run's **Artifacts** (kept for 30 days).
- **A release:** push a version tag and the installers are attached to a GitHub Release with generated notes:

  ```bash
  git tag v0.1.0 && git push origin v0.1.0
  ```

The builds are not code-signed, so Windows SmartScreen and macOS Gatekeeper warn on first run. The installer version comes from `apps/desktop/src-tauri/tauri.conf.json`, not the tag.

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
