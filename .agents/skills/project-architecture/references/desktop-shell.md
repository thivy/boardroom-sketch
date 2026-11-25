# Desktop shell

## The shell

`apps/desktop` is an Electron shell with no UI of its own. It starts the built web server
(`apps/web/.output`) as a bundled Bun sidecar and navigates its window to it.

- Keep the app a normal web server. The shell only supplies `PORT`, `HOST` and `TRANSCRIPTS_DB`.
- `scripts/prepare-resources.mjs` installs the packages the server build leaves external (currently
  `@github/copilot-sdk`) and stages the Bun runtime for Electron Builder.
- `src/main.mjs` owns process, filesystem, update and window operations. `src/preload.cjs` exposes
  only the narrow `window.boardroomSketch` API with context isolation and the sandbox enabled.
- The window has no native title bar. `AppHeader` marks CSS drag regions, and `window-controls.tsx`
  adds minimize, maximize and close through the preload bridge.

## Dev modes

- `desktop:dev` runs Vite on `127.0.0.1:3100` and points Electron at it for hot reload.
- `desktop:dev:built` builds the web app and resources, then runs the same sidecar path as a release.
- `desktop:build` builds installers and `desktop:release` is its release alias.

## Updates

- `packages/features/src/updates` sees only `window.boardroomSketch.updates`; it is inert in a normal
  browser and outside production builds.
- Electron Builder writes GitHub-provider configuration into packaged apps and generates the
  `latest.yml` and `latest-mac.yml` updater metadata.
- The Desktop app workflow builds on Windows and macOS, then creates the release tag only after every
  build passes.
