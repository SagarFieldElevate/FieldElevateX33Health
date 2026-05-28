import { Download } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// Simple anchor styled as an outline button — triggers the CSV route download.
export function ExportButton({
  href,
  label = "Export CSV",
  accent,
  className,
}: {
  href: string;
  label?: string;
  accent?: "teal";
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        accent === "teal" &&
          "border-teal-300 text-teal-700 hover:bg-teal-50 hover:text-teal-800",
        className,
      )}
    >
      <Download className="mr-1.5 h-4 w-4" />
      {label}
    </a>
  );
}
