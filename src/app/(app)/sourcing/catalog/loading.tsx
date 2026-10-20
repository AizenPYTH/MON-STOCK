import { LoadingRegion, PageHeaderSkeleton, Skeleton } from "@/components/ui/page";

export default function SourcingLoading() {
  return (
    <LoadingRegion label="Chargement du sourcing…">
      <PageHeaderSkeleton actions={2} />
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </LoadingRegion>
  );
}
