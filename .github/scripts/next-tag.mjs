// Prints the next version tag. Reads existing tags (one per line) from stdin and the bump kind from argv.
// Only tags like v1.2.3 count. With no such tag, the first release is v0.1.0 (the app's starting version).
// Usage: git tag | node next-tag.mjs <patch|minor|major>
import { readFileSync } from "node:fs";

const bump = process.argv[2] ?? "patch";
if (!["patch", "minor", "major"].includes(bump)) {
  throw new Error(`Unknown bump "${bump}": use patch, minor or major.`);
}

const versions = readFileSync(0, "utf8")
  .split(/\r?\n/)
  .map((tag) => /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim()))
  .filter(Boolean)
  .map((match) => match.slice(1).map(Number));

if (versions.length === 0) {
  console.log("v0.1.0");
} else {
  const [major, minor, patch] = versions
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
    .at(-1);
  const next =
    bump === "major"
      ? [major + 1, 0, 0]
      : bump === "minor"
        ? [major, minor + 1, 0]
        : [major, minor, patch + 1];
  console.log(`v${next.join(".")}`);
}
