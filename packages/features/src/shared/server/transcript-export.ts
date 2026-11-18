import type { SessionTranscript } from "@app/contracts";

export type ExportFormat = "txt" | "md" | "json";

export const EXPORT_TYPES: Record<ExportFormat, string> = {
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  json: "application/json",
};

export const isExportFormat = (value: string | null): value is ExportFormat =>
  value === "txt" || value === "md" || value === "json";

const time = (at: number) => new Date(at).toLocaleTimeString("en-GB");
const stamp = (at: number) => new Date(at).toLocaleString("en-GB");

function heading({ meeting, session }: SessionTranscript) {
  const end = session.endedAt ? ` to ${time(session.endedAt)}` : "";
  return { title: meeting.title, recorded: `Recorded ${stamp(session.startedAt)}${end}` };
}

export function renderTranscript(transcript: SessionTranscript, format: ExportFormat): string {
  if (format === "json") return JSON.stringify(transcript, null, 2);

  const { title, recorded } = heading(transcript);
  if (format === "md") {
    const lines = transcript.captions.map(
      ({ speaker, text, at }) => `**${speaker || "Unknown"}** (${time(at)}): ${text}`,
    );
    return `# ${title}\n\n${recorded}\n\n${lines.join("\n\n")}\n`;
  }

  const lines = transcript.captions.map(
    ({ speaker, text, at }) => `[${time(at)}] ${speaker ? `${speaker}: ` : ""}${text}`,
  );
  return `${title}\n${recorded}\n\n${lines.join("\n")}\n`;
}

/** A file name that is safe on every platform and in a header. */
export function exportFileName({ meeting, session }: SessionTranscript, format: ExportFormat) {
  const slug = meeting.title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  const started = new Date(session.startedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(started.getDate())}-${pad(started.getHours())}${pad(started.getMinutes())}`;
  return `${slug || "transcript"}-${date}.${format}`;
}
