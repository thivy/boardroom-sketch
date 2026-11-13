// Prepares what the Tauri bundle ships: a Node binary as the sidecar (named with the Rust target
// triple, as Tauri requires) and the built web server as a resource.
import { execFileSync } from "node:child_process";
import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "../web/.output");
if (!existsSync(join(output, "server", "index.mjs"))) {
  throw new Error("Build the web app first: bun run --cwd apps/web build");
}

let triple;
try {
  triple = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/host: (\S+)/)?.[1];
} catch {
  console.error(
    "rustc was not found. Install Rust (https://rustup.rs). If it is installed, open a new terminal so its PATH includes ~/.cargo/bin.",
  );
  process.exit(1);
}
if (!triple) throw new Error("Could not read the Rust target triple from rustc -vV");

const exe = process.platform === "win32" ? ".exe" : "";
const binaries = join(root, "src-tauri", "binaries");
mkdirSync(binaries, { recursive: true });
copyFileSync(process.execPath, join(binaries, `node-${triple}${exe}`));

const server = join(root, "src-tauri", "server");
rmSync(server, { recursive: true, force: true });
cpSync(output, server, { recursive: true });
console.log(`Sidecar node-${triple}${exe} and server resources ready.`);
