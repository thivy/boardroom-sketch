import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import { useEffect, useRef } from "react";
import { submitChat, useChatStore } from "./chat-store";
import { useChatStatus } from "./use-chat-status";

const SUGGESTIONS = [
  "Summarise this meeting in five bullet points.",
  "List the action items and who owns them.",
  "What decisions were made?",
  "What questions were left unanswered?",
];

export function ChatMessages() {
  const transcript = useChatStore((state) => state.transcript);
  const messages = useChatStore((state) => state.messages);
  const status = useChatStatus();
  const unavailable = status.data?.available === false;
  const started = messages.length > 0;
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {!started ? (
        <div className="mx-auto grid max-w-2xl gap-3 pt-8">
          <p className="text-sm text-muted-foreground">
            {transcript
              ? "Ask about the transcript you chose, or start with one of these."
              : "Ask anything, or choose a saved transcript above to analyse it."}
          </p>
          {transcript && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((text) => (
                <Button
                  key={text}
                  variant="outline"
                  size="sm"
                  onClick={() => submitChat(text, unavailable)}
                >
                  {text}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <ul className="mx-auto grid max-w-3xl gap-4">
          {messages.map(({ id, role, text, failed }) => (
            <li key={id} className={cn("flex", role === "user" && "justify-end")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap",
                  role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                  failed && "bg-destructive/10 text-destructive",
                )}
              >
                {text || <span className="text-muted-foreground">Thinking…</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div ref={end} />
    </div>
  );
}
