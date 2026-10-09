import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StockMovementInput } from "@/features/mobile-api/contract";
import { requireSupabase } from "~/lib/supabase";
import { useActiveOrg } from "~/org/org-provider";
import { applyMovement, fetchMarginContext, fetchSkuDetail, fetchStockPage, type StockFilter, type StockSort } from "~/data/stock";
import { fetchDashboard } from "~/data/dashboard";
import { fetchOrderDetail, fetchOrdersPage } from "~/data/sales";
import { fetchSourcingOverview } from "~/data/sourcing";

/** Toutes les clés commencent par l'organisation : changer d'organisation ne mélange jamais les données. */
export function useMarginContext() {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  return useQuery({
    queryKey: [orgId, "margin-context"],
    queryFn: () => fetchMarginContext(requireSupabase(), orgId, active.organization.settings),
    staleTime: 5 * 60_000,
  });
}

export function useDashboard() {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  const margin = useMarginContext();
  return useQuery({
    queryKey: [orgId, "dashboard"],
    queryFn: () => fetchDashboard(requireSupabase(), orgId, active.organization.currency, margin.data!),
    enabled: Boolean(margin.data),
  });
}

export function useStockList(params: { q: string; filter: StockFilter; sort: StockSort }) {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  const margin = useMarginContext();
  return useInfiniteQuery({
    queryKey: [orgId, "stock", params],
    queryFn: ({ pageParam }) => fetchStockPage(requireSupabase(), orgId, { ...params, q: params.q.trim() || undefined, page: pageParam }, margin.data!),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: Boolean(margin.data),
  });
}

export function useSkuDetail(skuId: string) {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  const margin = useMarginContext();
  return useQuery({
    queryKey: [orgId, "sku", skuId],
    queryFn: () => fetchSkuDetail(requireSupabase(), orgId, skuId, margin.data!),
    enabled: Boolean(margin.data) && Boolean(skuId),
  });
}

export function useApplyMovement() {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StockMovementInput) => applyMovement(requireSupabase(), orgId, input),
    onSuccess: async (_r, input) => {
      // La base est la source de vérité : relecture après chaque mouvement confirmé.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [orgId, "sku", input.sku_id] }),
        queryClient.invalidateQueries({ queryKey: [orgId, "stock"] }),
        queryClient.invalidateQueries({ queryKey: [orgId, "dashboard"] }),
      ]);
    },
  });
}

export function useOrders(q: string) {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  return useInfiniteQuery({
    queryKey: [orgId, "orders", q],
    queryFn: ({ pageParam }) => fetchOrdersPage(requireSupabase(), orgId, { q: q.trim() || undefined, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.hasMore ? all.length + 1 : undefined),
  });
}

export function useOrder(orderId: string) {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  return useQuery({ queryKey: [orgId, "order", orderId], queryFn: () => fetchOrderDetail(requireSupabase(), orgId, orderId), enabled: Boolean(orderId) });
}

export function useSourcingOverview() {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  return useQuery({ queryKey: [orgId, "sourcing-overview"], queryFn: () => fetchSourcingOverview(requireSupabase(), orgId) });
}
