import { LoadingRegion, PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/ui/page";

export default function RadarLoading() {
  return (
    <LoadingRegion label="Calcul du radar d'achat…">
      <PageHeaderSkeleton actions={1} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <TableSkeleton rows={8} />
    </LoadingRegion>
  );
}
