"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity } from "lucide-react";

import { cn } from "@/lib/utils";

const SALES_LINKS = [
  { href: "/", label: "Pipeline" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/review", label: "Review" },
  { href: "/reports", label: "Reports" },
];

export function TopNav() {
  const pathname = usePathname();
  const inPTIntel = pathname.startsWith("/pt-intel");

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/80 backdrop-blur",
        inPTIntel && "border-b-teal-600/30",
      )}
    >
      <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Wake Intel</span>
        </Link>

        {/* Product switch */}
        <nav className="flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
          <Link
            href="/"
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              !inPTIntel
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Sales
          </Link>
          <Link
            href="/pt-intel"
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              inPTIntel
                ? "bg-background text-teal-700 shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            PT Intel
          </Link>
        </nav>

        {/* Section links (sales only) */}
        {!inPTIntel && (
          <nav className="hidden items-center gap-4 text-sm md:flex">
            {SALES_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "transition-colors hover:text-foreground",
                  isActive(l.href)
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
