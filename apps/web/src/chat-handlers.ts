import { createChatHandlers } from "@app/features/chat/server";
import { createCopilotSession, getCopilotStatus } from "@app/copilot-sdk";
import { transcriptStore } from "./storage";

// Where answers come from. Swap the two Copilot functions to use another assistant.
export const chatHandlers = createChatHandlers(
  getCopilotStatus,
  createCopilotSession,
  transcriptStore,
);
