// Prepares what the Tauri bundle ships:
//  - a Node binary as the sidecar (named with the Rust target triple, as Tauri requires);
//  - the built web server as a resource, with the packages the build leaves external installed
//    next to it (the Copilot SDK finds its runtime in a platform package at run time).
import { execFileSync, execSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

// The server imports this package by name, so it needs a node_modules next to .output.
const rootPackage = JSON.parse(readFileSync(resolve(root, "../../package.json"), "utf8"));
writeFileSync(
  join(server, "package.json"),
  JSON.stringify({ private: true, dependencies: rootPackage.dependencies }, null, 2),
);
execSync("npm install --omit=dev --no-audit --no-fund --no-package-lock", {
  cwd: server,
  stdio: "inherit",
});

console.log(`Sidecar node-${triple}${exe} and server resources ready.`);
