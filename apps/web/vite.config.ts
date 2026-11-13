import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  server: { port: 3000 },
  // The dependency scanner follows imports into server-only code; the SDK is Node-only and has no browser build.
  optimizeDeps: { exclude: ["@github/copilot-sdk"] },
  // Bundle every dependency into the production server output so the published package needs no
  // node_modules. In dev, Vite's module runner can't inline CommonJS packages such as react.
  // The Copilot SDK stays out of the bundle: it finds its runtime in a platform package at run time.
  ssr: command === "build" ? { noExternal: true, external: ["@github/copilot-sdk"] } : {},
  // Workspace packages ship TypeScript source; Vite compiles them as part of the app graph.
  plugins: [
    tanstackStart(),
    nitro({ rollupConfig: { external: ["@github/copilot-sdk"] } }),
    viteReact(),
    tailwindcss(),
  ],
}));
