import { LoadingRegion, PageHeaderSkeleton, StatTileSkeleton, TableSkeleton } from "@/components/ui/page";

/** Chargement générique d'une page de l'application : en-tête, rangée d'indicateurs, liste. */
export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton className="max-sm:hidden" />
        <StatTileSkeleton className="max-sm:hidden" />
      </div>
      <TableSkeleton rows={6} />
    </LoadingRegion>
  );
}
