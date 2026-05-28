import { cn } from "@/lib/utils";
import { SIZE_CLASS_LABEL, sizeDotColor } from "@/lib/domain";
import type { SizeClass } from "@/lib/types";

export function SizeDot({
  sizeClass,
  className,
}: {
  sizeClass: SizeClass;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
        sizeDotColor(sizeClass),
        className,
      )}
      aria-hidden
    />
  );
}

export function SizeBadge({
  sizeClass,
  unitCount,
  className,
}: {
  sizeClass: SizeClass;
  unitCount?: number | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-foreground",
        className,
      )}
      title={SIZE_CLASS_LABEL[sizeClass]}
    >
      <SizeDot sizeClass={sizeClass} />
      {SIZE_CLASS_LABEL[sizeClass]}
      {unitCount != null && (
        <span className="text-muted-foreground">· {unitCount}u</span>
      )}
    </span>
  );
}
