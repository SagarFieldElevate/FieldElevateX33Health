import { ReviewItemCard } from "@/components/review-item-card";
import { getOpenReviewItems } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Review queue" };

export default async function ReviewPage() {
  const items = await getOpenReviewItems();

  // Group by facility for readability.
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.facility_id;
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} open item{items.length === 1 ? "" : "s"} to resolve
          before the monthly list goes out.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nothing to review. The queue is clear.
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(groups.values()).map((group) => (
            <div key={group[0].facility_id} className="space-y-2">
              {group.map((item) => (
                <ReviewItemCard key={item.id} item={item} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
