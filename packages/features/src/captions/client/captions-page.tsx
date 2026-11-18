import { useEffect } from "react";
import { AppHeader } from "../../app-header";
import { CaptionList } from "./caption-list";
import { CaptionStatusBar } from "./caption-status-bar";
import { resetCaptionStore } from "./caption-store";
import { RecordingControls } from "./recording-controls";

/** `options` is shown beside the recording buttons, for whatever the app wants to offer there. */
export function CaptionsPage({ options }: { options?: React.ReactNode } = {}) {
  // Leaving the page stops following; the recording itself keeps running on the server.
  useEffect(() => resetCaptionStore, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader title="Teams captions" />
      <RecordingControls options={options} />
      <CaptionStatusBar />
      <CaptionList />
    </div>
  );
}
