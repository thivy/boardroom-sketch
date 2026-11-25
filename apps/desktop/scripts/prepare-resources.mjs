import { execFileSync } from "node:child_process";
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
if (!process.versions.bun) {
  throw new Error("Run this with Bun: the bundled server runtime is a copy of this binary.");
}

const build = join(root, "build");
rmSync(build, { recursive: true, force: true });

const bun = join(build, "bun");
mkdirSync(bun, { recursive: true });
copyFileSync(process.execPath, join(bun, process.platform === "win32" ? "bun.exe" : "bun"));

const server = join(build, "server");
cpSync(output, server, { recursive: true });

const rootPackage = JSON.parse(readFileSync(resolve(root, "../../package.json"), "utf8"));
writeFileSync(
  join(server, "package.json"),
  JSON.stringify({ private: true, dependencies: rootPackage.dependencies }, null, 2),
);
execFileSync(process.execPath, ["install", "--production", "--no-save"], {
  cwd: server,
  stdio: "inherit",
});

console.log("Bundled Bun runtime and server resources are ready.");
