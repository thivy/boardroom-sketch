import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 3000 },
  // Workspace packages ship TypeScript source; Vite compiles them as part of the app graph.
  plugins: [tanstackStart(), nitro(), viteReact(), tailwindcss()],
});
