import { useCaptionStore } from "./caption-store";

export function CaptionList() {
  const captions = useCaptionStore((state) => state.captions);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {captions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Captions appear here as people speak.</p>
      ) : (
        <ul className="grid gap-3">
          {captions.map(({ id, speaker, text }) => (
            <li key={id}>
              {speaker && <div className="text-xs font-[560] text-muted-foreground">{speaker}</div>}
              <div>{text}</div>
            </li>
          ))}
        </ul>
      )}
      {/* A new function on every render, so React calls it again and the list follows each caption. */}
      <div ref={(end) => end?.scrollIntoView({ block: "end" })} />
    </div>
  );
}
