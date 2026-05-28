import { cn } from "@/lib/utils";

export interface Stat {
  label: string;
  value: number | string;
  accent?: "default" | "emerald" | "rose" | "amber" | "sky" | "teal";
}

const accentText: Record<NonNullable<Stat["accent"]>, string> = {
  default: "text-foreground",
  emerald: "text-emerald-600",
  rose: "text-rose-600",
  amber: "text-amber-600",
  sky: "text-sky-600",
  teal: "text-teal-600",
};

export function StatStrip({
  stats,
  className,
}: {
  stats: Stat[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {stats.map((s) => (
        <div key={s.label} className="bg-card px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {s.label}
          </div>
          <div
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              accentText[s.accent ?? "default"],
            )}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
