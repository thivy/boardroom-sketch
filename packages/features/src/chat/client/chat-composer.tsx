import { Button } from "@app/ui/components/button";
import { Textarea } from "@app/ui/components/textarea";
import { SendIcon, SquareIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { setChatDraft, stopChat, submitChat, useChatStore } from "./chat-store";
import { useChatStatus } from "./use-chat-status";

export function ChatComposer() {
  const draft = useChatStore((state) => state.draft);
  const busy = useChatStore((state) => state.busy);
  const status = useChatStatus();
  const unavailable = status.data?.available === false;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitChat(draft, unavailable);
    }
  }

  return (
    <div className="border-t p-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <Textarea
          aria-label="Message"
          placeholder={
            unavailable
              ? "Copilot is not available"
              : "Message (Enter to send, Shift+Enter for a new line)"
          }
          className="max-h-40 min-h-10 flex-1 resize-none"
          rows={1}
          value={draft}
          disabled={unavailable}
          onValueChange={setChatDraft}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <Button variant="secondary" size="icon" aria-label="Stop" onClick={stopChat}>
            <SquareIcon />
          </Button>
        ) : (
          <Button
            size="icon"
            aria-label="Send"
            disabled={!draft.trim() || unavailable}
            onClick={() => submitChat(draft, unavailable)}
          >
            <SendIcon />
          </Button>
        )}
      </div>
    </div>
  );
}
