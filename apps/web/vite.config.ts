import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  server: { port: 3000 },
  // Bundle every dependency into the production server output so the published package needs no
  // node_modules. In dev, Vite's module runner can't inline CommonJS packages such as react.
  ssr: command === "build" ? { noExternal: true } : {},
  // Workspace packages ship TypeScript source; Vite compiles them as part of the app graph.
  plugins: [tanstackStart(), nitro(), viteReact(), tailwindcss()],
}));
