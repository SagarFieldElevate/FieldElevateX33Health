import { FollowUpList } from "@/components/follow-up-list";
import { getOpenFollowUps } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Follow-ups" };

export default async function FollowUpsPage() {
  const items = await getOpenFollowUps();
  const now = Date.now();
  const overdue = items.filter(
    (i) => i.follow_up_at && new Date(i.follow_up_at).getTime() < now,
  ).length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} open
          {overdue > 0 && (
            <span className="text-rose-600"> · {overdue} overdue</span>
          )}
          , sorted by due date.
        </p>
      </div>
      <FollowUpList items={items} />
    </div>
  );
}
