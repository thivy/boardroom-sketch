import { AppHeader } from "../../app-header";
import { ChatComposer } from "./chat-composer";
import { ChatMessages } from "./chat-messages";
import { ChatToolbar } from "./chat-toolbar";
import { useChatStatus } from "./use-chat-status";

export function ChatPage() {
  const status = useChatStatus();
  const unavailable = status.data?.available === false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader title="Analysis chat" />

      <ChatToolbar />

      {unavailable && (
        <p role="alert" className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {status.data?.message}
        </p>
      )}

      <ChatMessages />

      <ChatComposer />
    </div>
  );
}
