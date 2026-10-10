import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StockMovementInput } from "@/features/mobile-api/contract";
import { requireSupabase } from "~/lib/supabase";
import { useActiveOrg } from "~/org/org-provider";
import { useUser } from "~/auth/session-provider";
import { applyMovement, fetchMarginContext, fetchSkuDetail } from "~/data/stock";
import { fetchCatalog } from "~/data/catalog";
import { fetchAnalysis, fetchToday, type Period } from "~/data/intelligence";
import { fetchListings, fetchOrderDetail, fetchOrdersFiltered, fetchSalesKpis } from "~/data/sales";
import { createDraftPurchaseOrder, deleteDraftPurchaseOrder, fetchActiveSuppliers, fetchComparison, fetchOfferGroups, type OfferRow } from "~/data/compare";
import { fetchSourcingOverview } from "~/data/sourcing";
import { activateLibrarySource, fetchLibrary, searchOffers } from "~/data/sourcing-live";
import { applyPendingSales, connectEbay, fetchIntegrations, fetchListing, mapListing, syncEbay } from "~/data/ebay";
import type { ProductWithVariantsInput, VariantInput } from "@/features/stock/product-form";
import {
  addVariants,
  createProduct,
  fetchEditableProduct,
  fetchEditableSku,
  updateProduct,
  updateSku,
  type EditableProduct,
  type EditableSku,
  type ProductEditInput,
  type SkuEditInput,
} from "~/data/products";

/** Toutes les clés commencent par l'organisation : changer d'organisation ne mélange jamais les données. */
function useOrgId() {
  const { active } = useActiveOrg();
  return active.organization.id;
}

export function useMarginContext() {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  return useQuery({
    queryKey: [orgId, "margin-context"],
    queryFn: () => fetchMarginContext(requireSupabase(), orgId, active.organization.settings),
    staleTime: 5 * 60_000,
  });
}

export function useCatalog() {
  const orgId = useOrgId();
  const margin = useMarginContext();
  return useQuery({ queryKey: [orgId, "catalog"], queryFn: () => fetchCatalog(requireSupabase(), orgId, margin.data!), enabled: Boolean(margin.data) });
}

export function useSkuDetail(skuId: string) {
  const orgId = useOrgId();
  const margin = useMarginContext();
  return useQuery({ queryKey: [orgId, "sku", skuId], queryFn: () => fetchSkuDetail(requireSupabase(), orgId, skuId, margin.data!), enabled: Boolean(margin.data) && Boolean(skuId) });
}

/** Mouvement de stock confirmé par la base, puis relecture du catalogue et des indicateurs. */
export function useApplyMovement() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StockMovementInput) => applyMovement(requireSupabase(), orgId, input),
    onSettled: async (_r, _e, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [orgId, "sku", input.sku_id] }),
        queryClient.invalidateQueries({ queryKey: [orgId, "catalog"] }),
        queryClient.invalidateQueries({ queryKey: [orgId, "today"] }),
        queryClient.invalidateQueries({ queryKey: [orgId, "analysis"] }),
      ]);
    },
  });
}

export function useToday() {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  return useQuery({ queryKey: [orgId, "today"], queryFn: () => fetchToday(requireSupabase(), orgId, active.organization.currency) });
}

export function useAnalysis(period: Period) {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  const catalog = useCatalog();
  return useQuery({
    queryKey: [orgId, "analysis", period],
    queryFn: () => fetchAnalysis(requireSupabase(), orgId, active.organization.currency, catalog.data!, period),
    enabled: Boolean(catalog.data),
  });
}

export function useSalesKpis() {
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  return useQuery({ queryKey: [orgId, "sales-kpis"], queryFn: () => fetchSalesKpis(requireSupabase(), orgId, active.organization.currency) });
}

export function useOrders(status?: string) {
  const orgId = useOrgId();
  return useInfiniteQuery({
    queryKey: [orgId, "orders", status ?? "all"],
    queryFn: ({ pageParam }) => fetchOrdersFiltered(requireSupabase(), orgId, { status, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.hasMore ? all.length + 1 : undefined),
  });
}

export function useListings(enabled: boolean) {
  const orgId = useOrgId();
  return useInfiniteQuery({
    queryKey: [orgId, "listings"],
    queryFn: ({ pageParam }) => fetchListings(requireSupabase(), orgId, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.hasMore ? all.length + 1 : undefined),
    enabled,
  });
}

export function useOrder(orderId: string) {
  const orgId = useOrgId();
  return useQuery({ queryKey: [orgId, "order", orderId], queryFn: () => fetchOrderDetail(requireSupabase(), orgId, orderId), enabled: Boolean(orderId) });
}

export function useOfferGroups() {
  const orgId = useOrgId();
  return useQuery({ queryKey: [orgId, "offer-groups"], queryFn: () => fetchOfferGroups(requireSupabase(), orgId) });
}

export function useActiveSuppliers() {
  const orgId = useOrgId();
  return useQuery({ queryKey: [orgId, "suppliers"], queryFn: () => fetchActiveSuppliers(requireSupabase(), orgId) });
}

export function useSourcingOverview() {
  const orgId = useOrgId();
  return useQuery({ queryKey: [orgId, "sourcing-overview"], queryFn: () => fetchSourcingOverview(requireSupabase(), orgId) });
}

export function useComparison(key: string) {
  const orgId = useOrgId();
  const margin = useMarginContext();
  return useQuery({ queryKey: [orgId, "compare", key], queryFn: () => fetchComparison(requireSupabase(), orgId, key, margin.data!), enabled: Boolean(margin.data) && Boolean(key) });
}

export function useDraftPurchaseOrder() {
  const { active } = useActiveOrg();
  const user = useUser();
  const queryClient = useQueryClient();
  const orgId = active.organization.id;
  return {
    create: useMutation({
      mutationFn: (input: { offer: Pick<OfferRow, "id" | "supplierId" | "skuId" | "price">; quantity: number }) =>
        createDraftPurchaseOrder(requireSupabase(), { organizationId: orgId, userId: user?.id ?? "", currency: active.organization.currency, ...input }),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: [orgId, "suppliers"] }),
    }),
    remove: useMutation({
      mutationFn: (purchaseOrderId: string) => deleteDraftPurchaseOrder(requireSupabase(), orgId, purchaseOrderId),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: [orgId, "suppliers"] }),
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Catalogue : création et édition (fonctions SQL existantes, sous RLS)
// ---------------------------------------------------------------------------------------------

/** Après toute écriture du catalogue : relecture de tout ce qui en dépend. */
function useInvalidateCatalog() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return async (extra: unknown[][] = []) => {
    await Promise.all(
      [[orgId, "catalog"], [orgId, "today"], [orgId, "analysis"], [orgId, "sourcing-overview"], ...extra].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  };
}

export function useCreateProduct() {
  const { active } = useActiveOrg();
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (input: ProductWithVariantsInput) => createProduct(requireSupabase(), active.organization.id, active.organization.currency, input),
    onSuccess: () => invalidate(),
  });
}

export function useAddVariants(productId: string) {
  const { active } = useActiveOrg();
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (variants: VariantInput[]) => addVariants(requireSupabase(), active.organization.id, active.organization.currency, productId, variants),
    onSuccess: () => invalidate([[active.organization.id, "product", productId]]),
  });
}

export function useEditableProduct(productId: string) {
  const orgId = useOrgId();
  return useQuery({ queryKey: [orgId, "product", productId], queryFn: () => fetchEditableProduct(requireSupabase(), orgId, productId), enabled: Boolean(productId) });
}

export function useUpdateProduct() {
  const orgId = useOrgId();
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ current, input }: { current: EditableProduct; input: ProductEditInput }) => updateProduct(requireSupabase(), orgId, current, input),
    onSettled: (_r, _e, v) => invalidate([[orgId, "product", v.current.id]]),
  });
}

export function useEditableSku(skuId: string) {
  const orgId = useOrgId();
  return useQuery({ queryKey: [orgId, "sku-edit", skuId], queryFn: () => fetchEditableSku(requireSupabase(), orgId, skuId), enabled: Boolean(skuId) });
}

export function useUpdateSku() {
  const orgId = useOrgId();
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ current, input }: { current: EditableSku; input: SkuEditInput }) => updateSku(requireSupabase(), orgId, current, input),
    onSettled: (_r, _e, v) => invalidate([[orgId, "sku", v.current.id], [orgId, "sku-edit", v.current.id]]),
  });
}

// ---------------------------------------------------------------------------------------------
// Sourcing en direct et bibliothèque de sources (serveur)
// ---------------------------------------------------------------------------------------------

export function useOfferSearch(query: string, sku?: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [orgId, "sourcing-search", query, sku ?? null],
    queryFn: () => searchOffers(orgId, query, { sku }),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

export function useSourceLibrary() {
  const orgId = useOrgId();
  return useQuery({ queryKey: [orgId, "source-library"], queryFn: () => fetchLibrary(orgId) });
}

export function useActivateSource() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => activateLibrarySource(orgId, key),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [orgId, "source-library"] }),
        queryClient.invalidateQueries({ queryKey: [orgId, "sourcing-overview"] }),
        queryClient.invalidateQueries({ queryKey: [orgId, "suppliers"] }),
        queryClient.invalidateQueries({ queryKey: [orgId, "sourcing-search"] }),
      ]),
  });
}

// ---------------------------------------------------------------------------------------------
// eBay (serveur pour les tokens ; association annonce ↔ SKU sous RLS)
// ---------------------------------------------------------------------------------------------

export function useIntegrations() {
  const orgId = useOrgId();
  return useQuery({ queryKey: [orgId, "integrations"], queryFn: () => fetchIntegrations(orgId), retry: 0 });
}

function useInvalidateSales() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [[orgId, "integrations"], [orgId, "listings"], [orgId, "orders"], [orgId, "sales-kpis"], [orgId, "catalog"], [orgId, "today"], [orgId, "analysis"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

export function useConnectEbay() {
  const orgId = useOrgId();
  const invalidate = useInvalidateSales();
  return useMutation({ mutationFn: () => connectEbay(orgId), onSettled: () => invalidate() });
}

export function useSyncEbay() {
  const orgId = useOrgId();
  const invalidate = useInvalidateSales();
  return useMutation({ mutationFn: (connectionId: string) => syncEbay(orgId, connectionId), onSettled: () => invalidate() });
}

export function useListing(listingId: string) {
  const orgId = useOrgId();
  return useQuery({ queryKey: [orgId, "listing", listingId], queryFn: () => fetchListing(requireSupabase(), orgId, listingId), enabled: Boolean(listingId) });
}

export function useMapListing(listingId: string) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: (skuId: string | null) => mapListing(requireSupabase(), listingId, skuId),
    onSettled: () => Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: [orgId, "listing", listingId] })]),
  });
}

export function useApplyPendingSales(skuId: string) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => applyPendingSales(requireSupabase(), skuId),
    onSettled: () => Promise.all([[orgId, "sku", skuId], [orgId, "catalog"], [orgId, "today"], [orgId, "analysis"]].map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}
