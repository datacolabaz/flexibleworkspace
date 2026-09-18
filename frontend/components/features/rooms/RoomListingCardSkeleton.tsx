import { Skeleton } from '@/components/ui/Skeleton';

/** Matches <RoomListingCard>'s exact box shape (07_UX_ARCHITECTURE.md
 * §7.6) so results don't visibly reflow once the real cards arrive. */
export function RoomListingCardSkeleton() {
  return (
    <div className="flex gap-4 rounded-lg border border-border bg-surface p-3 shadow-sm" aria-hidden="true">
      <Skeleton className="h-28 w-36 shrink-0 sm:h-32 sm:w-44" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <div className="mt-auto flex items-center justify-between pt-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
    </div>
  );
}
