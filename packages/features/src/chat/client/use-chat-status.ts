import type { ChatStatus } from "@app/contracts";
import { useQuery } from "@tanstack/react-query";
import { request } from "../../shared/client/api-request";

export function useChatStatus() {
  return useQuery({
    queryKey: ["chat", "status"],
    queryFn: () => request<ChatStatus>("/api/chat/status"),
    staleTime: 60_000,
    retry: false,
  });
}
