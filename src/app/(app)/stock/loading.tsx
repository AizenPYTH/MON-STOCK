import { LoadingRegion, PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/ui/page";

export default function StockLoading() {
  return (
    <LoadingRegion label="Chargement du stock…">
      <PageHeaderSkeleton actions={1} />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-full sm:w-72" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
      </div>
      <TableSkeleton rows={10} />
    </LoadingRegion>
  );
}
