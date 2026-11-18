import type { StoredSession } from "@app/contracts";

const stamp = (at: number) => new Date(at).toLocaleString();
export const time = (at: number) => new Date(at).toLocaleTimeString();

export function sessionLabel({ startedAt, endedAt, captionCount }: StoredSession) {
  const range = endedAt
    ? `${stamp(startedAt)} – ${time(endedAt)}`
    : `${stamp(startedAt)} · recording`;
  return `${range} · ${captionCount} lines`;
}
