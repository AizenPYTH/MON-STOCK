import { LoadingRegion, PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/ui/page";

export default function SourcingLoading() {
  return (
    <LoadingRegion label="Chargement du sourcing…">
      <PageHeaderSkeleton actions={3} />
      <Skeleton className="h-28 rounded-xl" />
      <TableSkeleton rows={6} />
    </LoadingRegion>
  );
}
