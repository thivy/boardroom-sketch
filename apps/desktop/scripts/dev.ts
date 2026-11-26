import electronPath from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = resolve(root, "../web");
const devHost = "127.0.0.1";
const devPort = 3100;
const url = `http://${devHost}:${devPort}`;
const vite = spawn(
  process.execPath,
  ["run", "--cwd", web, "dev", "--host", devHost, "--port", String(devPort), "--strictPort"],
  { cwd: root, stdio: "inherit" },
);

let electron: ChildProcess | undefined;
let stopping = false;

function stop(child: ChildProcess | undefined) {
  if (child && child.exitCode === null && child.signalCode === null) child.kill();
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  stop(electron);
  stop(vite);
  process.exitCode = code;
}

// A TCP connect is enough to know Vite is listening. An HTTP probe with a timeout would be cut off
// while Vite compiles the first page, and Vite logs each cut-off request as "Error: aborted".
function portIsOpen() {
  return new Promise<boolean>((resolvePromise) => {
    const socket = connect({ host: devHost, port: devPort });
    socket.once("connect", () => {
      socket.destroy();
      resolvePromise(true);
    });
    socket.once("error", () => resolvePromise(false));
  });
}

async function waitForVite() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (vite.exitCode !== null) throw new Error("The Vite development server stopped.");
    if (await portIsOpen()) return;
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
  electron = spawn(electronPath as unknown as string, [".", ...process.argv.slice(2)], {
    cwd: root,
    env: { ...process.env, BOARDROOM_SKETCH_DEV_URL: url },
    stdio: "inherit",
  });
  electron.once("exit", (code) => shutdown(code ?? 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
