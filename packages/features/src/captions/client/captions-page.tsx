import { AppHeader } from "../../app-header";
import { CaptionList } from "./caption-list";
import { CaptionStatusBar } from "./caption-status-bar";
import { RecordingControls } from "./recording-controls";

/** `options` is shown beside the recording buttons, for whatever the app wants to offer there. */
export function CaptionsPage({ options }: { options?: React.ReactNode } = {}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader title="Teams captions" />
      <RecordingControls options={options} />
      <CaptionStatusBar />
      <CaptionList />
    </div>
  );
}
