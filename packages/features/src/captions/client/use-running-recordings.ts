import type { ActiveRecording } from "@app/contracts";
import { useQuery } from "@tanstack/react-query";
import { request } from "../../shared/client/api-request";
import { resumeRecording } from "./caption-store";

async function fetchRecordings() {
  const recordings = await request<ActiveRecording[]>("/api/captions/recordings");
  resumeRecording(recordings);
  return recordings;
}

// A recording keeps running on the server when this page closes; the first fetch picks it up again.
export function useRunningRecordings() {
  return useQuery({
    queryKey: ["captions", "recordings"],
    queryFn: fetchRecordings,
    staleTime: 0,
    gcTime: 0,
  });
}
