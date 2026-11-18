import { cn } from "@app/ui/lib/utils";
import type { NodeType } from "@app/contracts";
import { TONE_VISUALS, humanize, toneOf } from "./visuals";

export const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function ago(now: number, at: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

export function Card({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4", className)}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-[560] tracking-[0.08em] text-muted-foreground uppercase">
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function StatusPill({ status, type }: { status: string; type?: NodeType }) {
  const tone = toneOf(status);
  const color = TONE_VISUALS[tone].color;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-[560] tracking-wide uppercase",
        tone === "dead" && "line-through",
      )}
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
      title={type ? `${type} · ${status}` : status}
    >
      {humanize(status)}
    </span>
  );
}
