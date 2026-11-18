import type { ActiveRecording } from "@app/contracts";
import { useQuery } from "@tanstack/react-query";
import { request } from "../../shared/client/api-request";

const fetchRecordings = () => request<ActiveRecording[]>("/api/captions/recordings");

// A recording keeps running on the server when this page closes; pick it up again on return.
export function useRunningRecordings() {
  return useQuery({
    queryKey: ["captions", "recordings"],
    queryFn: fetchRecordings,
    staleTime: 0,
    gcTime: 0,
  });
}
