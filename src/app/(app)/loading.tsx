import { LoadingRegion, PageHeaderSkeleton, Skeleton } from "@/components/ui/page";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </LoadingRegion>
  );
}
