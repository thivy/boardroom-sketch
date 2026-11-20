# Desktop shell

## The shell

`apps/desktop` is a Tauri shell with no UI of its own. It starts the built web server (`apps/web/.output`) as a bundled Bun sidecar and navigates its window to it.

- Keep the app a normal web server. The shell only supplies `PORT`, `HOST` and `TRANSCRIPTS_DB`.
- `scripts/prepare-sidecar.mjs` must install the packages the server build leaves external (currently `@github/copilot-sdk`).
- The window has no native title bar. `AppHeader` marks drag regions, and `window-controls.tsx` adds minimize, maximize and close.

## Dev modes

- `desktop:dev` uses `src-tauri/tauri.dev.conf.json`, which sets `build.devUrl` to the Vite dev server (port 3100). `lib.rs` starts no sidecar when `tauri::is_dev()` and a dev URL are both set.
- `desktop:dev:built` is the older run that uses the built sidecar.
- `desktop:build` and `desktop:release` build the app.

## Updates

- `packages/features/src/updates` talks to Tauri only through `window.__TAURI__`. It has no `@tauri-apps` import, so it is inert in a browser. The update prompt is skipped outside production builds.
- The updater endpoint, public key and the `127.0.0.1` capability live in `apps/desktop/src-tauri`.
- The Desktop app workflow (`.github/workflows/desktop.yml`) signs builds, creates the release tag only after every build passes, and writes `latest.json`.
