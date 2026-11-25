import electronPath from "electron";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = resolve(root, "../web");
const url = "http://127.0.0.1:3100";
const vite = spawn(
  process.execPath,
  ["run", "--cwd", web, "dev", "--host", "127.0.0.1", "--port", "3100", "--strictPort"],
  { cwd: root, stdio: "inherit" },
);

let electron;
let stopping = false;

function stop(child) {
  if (child && child.exitCode === null && child.signalCode === null) child.kill();
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  stop(electron);
  stop(vite);
  process.exitCode = code;
}

async function waitForVite() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (vite.exitCode !== null) throw new Error("The Vite development server stopped.");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // Vite may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`The Vite development server did not become ready at ${url}.`);
}

vite.once("exit", (code) => {
  if (!stopping) shutdown(code ?? 1);
});
process.once("SIGINT", () => shutdown());
process.once("SIGTERM", () => shutdown());

try {
  await waitForVite();
  electron = spawn(electronPath, [".", ...process.argv.slice(2)], {
    cwd: root,
    env: { ...process.env, BOARDROOM_SKETCH_DEV_URL: url },
    stdio: "inherit",
  });
  electron.once("exit", (code) => shutdown(code ?? 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
