#!/usr/bin/env node
const args = process.argv.slice(2);
const portFlag = args.findIndex((arg) => arg === "--port" || arg === "-p");

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: boardroom-sketch [--port <number>]");
  process.exit(0);
}

if (portFlag !== -1) process.env.PORT = args[portFlag + 1];
process.env.PORT ??= "3000";

await import(new URL("../apps/web/.output/server/index.mjs", import.meta.url).href);
