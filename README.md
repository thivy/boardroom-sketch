# Boardroom Sketch

A [Bun](https://bun.sh) workspaces monorepo: a thin [TanStack Start](https://tanstack.com/start) app with an app shell (sidebar, header, theme toggle).

```
apps/web             TanStack Start app: root route and page routes. Nothing else.
packages/features    One folder per feature: `app-shell` (sidebar layout) and `app-header`.
apps/desktop         Tauri shell: opens a window on the web app, which runs as a bundled Node sidecar.
packages/components  shadcn components, `cn()` helper and the Tailwind theme (`styles.css`).
packages/contracts   Types shared by client, server and adapters, including the `CaptionSource` port.
packages/teams-cdp   Interim `CaptionSource` that reads Teams captions over the Chrome DevTools Protocol.
```

Dependency direction: `web` → `features`, `components`, `teams-cdp`; `features` → `components`, `contracts`; `teams-cdp` → `contracts`. The captions feature knows only the `CaptionSource` port; the app wires the adapter in `apps/web/src/caption-handlers.ts` (see [`packages/features/CAPTIONS.md`](packages/features/CAPTIONS.md) and [`packages/teams-cdp`](packages/teams-cdp/README.md)).
Server state on the client goes through [TanStack Query](https://tanstack.com/query): `apps/web/src/router.tsx` creates a `QueryClient` per request and connects it to the router for server rendering.

Packages ship TypeScript source (`exports` point at `src/`); Vite compiles them as part of the app graph.

## Teams captions

The **Teams captions** page reads live captions from a Teams meeting you have open in Chrome (or Edge), through the Chrome DevTools Protocol:

1. **Teams desktop (new Teams, Windows):** click **Restart Teams** on the page. It quits Teams and relaunches it with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, then waits for DevTools. **Or a browser:** start it with remote debugging on a separate profile: `chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\chrome-teams`.
2. Join the meeting and turn on **Live captions** (More > Language and speech).
3. Open the app, choose **Teams captions**, click **Find meetings**, then **Connect**. Captions stream in; you can copy, download or clear the transcript.

The adapter only talks to DevTools on `127.0.0.1` (port from `TEAMS_CDP_PORT`, default 9222). Restarting Teams ends any meeting you are in. It reads the caption elements of the Teams web client, so a Teams UI change can break it; the selectors are in `packages/teams-cdp/src/observer-script.ts`. Needs Node 22+ (global `WebSocket`).

## Desktop app (Tauri)

`apps/desktop` wraps the web app in a native window. The app needs its server (it talks to Teams over CDP and can restart Teams), so Tauri ships the built server as a resource and runs it with a bundled Node binary as a sidecar on a free local port; the window loads it from `127.0.0.1`. The sidecar is stopped when the window closes.

Needs [Rust](https://rustup.rs) and, on Windows, the Visual Studio C++ Build Tools plus WebView2 (included in Windows 11).

```bash
bun run desktop:dev     # builds the web app, prepares the sidecar, opens the window
bun run desktop:build   # produces an installer under apps/desktop/src-tauri/target/release/bundle
```

Dev runs the production server build, so rebuild (`desktop:dev` again) after changing web code; use `bun run dev` for hot reload in a browser.

## Run without cloning

```bash
npx boardroom-sketch            # or: bunx boardroom-sketch
npx boardroom-sketch --port 8080
```

Needs Node 22+. The package ships the prebuilt server, so nothing is installed or built on first run.

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
