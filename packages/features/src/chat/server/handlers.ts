import type { CreateChatSession, GetChatStatus, TranscriptStore } from "@app/contracts";
import { createConversations } from "./conversations";
import { closeConversation, sendMessage } from "./message-handlers";
import { chatStatus } from "./status-handlers";

/**
 * Composes the chat endpoint groups into plain `(Request) => Response` handlers over a way to read
 * the assistant's status, a way to start a conversation, and a `TranscriptStore`.
 */
export function createChatHandlers(
  getChatStatus: GetChatStatus,
  createChatSession: CreateChatSession,
  store: TranscriptStore,
) {
  const conversations = createConversations(createChatSession, store);

  return {
    status: () => chatStatus(getChatStatus),
    message: (request: Request) => sendMessage(request, conversations),
    close: (request: Request) => closeConversation(request, conversations),
  };
}
