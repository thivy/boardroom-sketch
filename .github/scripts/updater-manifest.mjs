// Writes latest.json, the manifest the Tauri updater reads from the latest GitHub Release, and gives
// the installers names without spaces so their download URLs match the manifest.
// Usage: node updater-manifest.mjs <installers dir> <tag> <owner/repo>
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, tag, repo] = process.argv.slice(2);
if (!dir || !tag || !repo) throw new Error("Usage: updater-manifest.mjs <dir> <tag> <owner/repo>");

function files(folder) {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

// Spaces become dots, as GitHub does for uploaded assets.
const renamed = files(dir).map((path) => {
  const fixed = path.replace(/[^\\/]+$/, (name) => name.replaceAll(" ", "."));
  if (fixed !== path) renameSync(path, fixed);
  return fixed;
});

const platforms = {};
// First match wins, so the installer an update should run is listed before alternatives.
const targets = [
  ["windows-x86_64", /-setup\.exe$/],
  ["windows-x86_64", /\.msi$/],
  ["darwin-aarch64", /\.app\.tar\.gz$/],
];
for (const [platform, pattern] of targets) {
  if (platforms[platform]) continue;
  const file = renamed.find((path) => pattern.test(path) && renamed.includes(`${path}.sig`));
  if (!file) continue;
  platforms[platform] = {
    signature: readFileSync(`${file}.sig`, "utf8").trim(),
    url: `https://github.com/${repo}/releases/download/${tag}/${file.split(/[\\/]/).pop()}`,
  };
}

if (Object.keys(platforms).length === 0) throw new Error("No signed update packages were found.");

writeFileSync(
  join(dir, "latest.json"),
  JSON.stringify(
    { version: tag.replace(/^v/, ""), notes: "", pub_date: new Date().toISOString(), platforms },
    null,
    2,
  ),
);
console.log(`latest.json for ${tag}: ${Object.keys(platforms).join(", ")}`);
