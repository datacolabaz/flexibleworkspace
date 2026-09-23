import { Skeleton } from '@/components/ui/Skeleton';

/** Matches <RoomListingCard>'s exact box shape (07_UX_ARCHITECTURE.md
 * §7.6) — stacked photo-on-top layout, same as the real card — so
 * results don't visibly reflow once the real cards arrive. */
export function RoomListingCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm" aria-hidden="true">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <div className="mt-2 flex items-center justify-between pt-1">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
