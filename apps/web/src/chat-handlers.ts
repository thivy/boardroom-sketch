import { createChatHandlers } from "@app/features/chat/server";
import { copilotChat } from "@app/copilot-sdk";
import { transcriptStore } from "./caption-handlers";

// Where answers come from. Swap `copilotChat()` to use another assistant.
export const chatHandlers = createChatHandlers(copilotChat(), transcriptStore);
