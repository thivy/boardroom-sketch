# Boardroom Sketch

A [Bun](https://bun.sh) workspaces monorepo: a thin [TanStack Start](https://tanstack.com/start) app with an app shell (sidebar, header, theme toggle).

```
apps/web             TanStack Start app: root route and page routes. Nothing else.
packages/features    One folder per feature: `app-shell` (sidebar layout) and `app-header`.
packages/components  shadcn components, `cn()` helper and the Tailwind theme (`styles.css`).
```

Dependency direction: `web` → `features`, `components`; `features` → `components`.
Server state on the client goes through [TanStack Query](https://tanstack.com/query): `apps/web/src/router.tsx` creates a `QueryClient` per request and connects it to the router for server rendering.

Packages ship TypeScript source (`exports` point at `src/`); Vite compiles them as part of the app graph.

## Getting started

```bash
bun install
bun run dev        # http://localhost:3000
```
bun run dev        # http://localhost:3000
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
