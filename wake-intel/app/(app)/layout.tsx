import { TopNav } from "@/components/top-nav";

export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <TopNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
