import { CopilotClient } from "@github/copilot-sdk";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let client: Promise<CopilotClient> | undefined;

/** One runtime serves every chat and model call; it starts with the first use. */
export function copilotClient(): Promise<CopilotClient> {
  client ??= (async () => {
    const created = new CopilotClient();
    await created.start();
    return created;
  })().catch((error) => {
    client = undefined;
    throw error;
  });
  return client;
}

/** This is a chat or a typed answer, not an agent: no shell, no files, no MCP servers, whatever the user has installed. */
export const NO_TOOLS = ["builtin:*", "mcp:*", "custom:*"];

/** A folder with nothing in it, so the runtime does not pick up instructions from wherever the server runs. */
export function emptyWorkingDirectory() {
  const directory = join(tmpdir(), "boardroom-sketch-chat");
  mkdirSync(directory, { recursive: true });
  return directory;
}
