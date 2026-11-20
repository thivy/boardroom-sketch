import type { GetChatStatus } from "@app/contracts";
import { json } from "../../shared/server/http";

/** `GET`: whether the assistant can be used, and as whom. */
export async function chatStatus(getChatStatus: GetChatStatus): Promise<Response> {
  return json(await getChatStatus());
}
