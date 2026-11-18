import type { ChatStatus } from "@app/contracts";
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

/**
 * Whether Copilot can be used: the runtime runs as the account the machine is already signed in to
 * (`gh auth login`).
 */
export async function getCopilotStatus(): Promise<ChatStatus> {
  try {
    const auth = await (await copilotClient()).getAuthStatus();
    if (auth.isAuthenticated) {
      return {
        available: true,
        account: auth.login,
        message: auth.statusMessage ?? `Signed in as ${auth.login}`,
      };
    }
    return {
      available: false,
      message: "Not signed in to GitHub Copilot. Run `gh auth login` and try again.",
    };
  } catch (error) {
    return {
      available: false,
      message: error instanceof Error ? error.message : "Could not start the Copilot runtime.",
    };
  }
}

/** This is a chat or a typed answer, not an agent: no shell, no files, no MCP servers, whatever the user has installed. */
export const NO_TOOLS = ["builtin:*", "mcp:*", "custom:*"];

/** A folder with nothing in it, so the runtime does not pick up instructions from wherever the server runs. */
export function emptyWorkingDirectory() {
  const directory = join(tmpdir(), "boardroom-sketch-chat");
  mkdirSync(directory, { recursive: true });
  return directory;
}
