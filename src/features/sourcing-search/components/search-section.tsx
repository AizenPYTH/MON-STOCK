import "server-only";
import Link from "next/link";
import { SearchX } from "lucide-react";
import type { OrgContext } from "@/features/auth/dal";
import type { SimpleSearchDTO } from "@/features/mobile-api/contract";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout, EmptyState, LoadingRegion, Skeleton, TableSkeleton } from "@/components/ui/page";
import { callEdgeApi } from "@/lib/edge-api";
import { toUserMessage } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { checkedSummary, simplerQuery } from "@/features/sourcing-search/display";
import { SupplierSearchResults } from "@/features/sourcing-search/components/search-results";

/** État d'attente honnête : aucune progression simulée, seulement ce qui se passe et la durée maximale. */
export function SearchPending({ query }: { query: string }) {
  return (
    <LoadingRegion label={`Recherche de « ${query} » chez vos fournisseurs en cours…`}>
      <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        <p className="font-medium text-foreground">Recherche de « {query} » chez vos fournisseurs…</p>
        <p className="mt-0.5 text-muted">Les fournisseurs sont interrogés en direct : cela peut prendre jusqu&apos;à 35 secondes environ. Au-delà, les offres déjà enregistrées s&apos;affichent.</p>
      </div>
      <Skeleton className="h-24 rounded-xl" />
      <TableSkeleton rows={8} />
    </LoadingRegion>
  );
}

/**
 * Recherche puis résultats ; erreur rédigée pour l'utilisateur, jamais une page d'erreur.
 * La recherche passe par le serveur de l'application iPhone (Edge Function « /suppliers/search ») :
 * mêmes sources (dont la place de marché eBay et ses identifiants), mêmes délais, mêmes résultats
 * que sur l'iPhone, sans recopier de secret dans Vercel.
 */
export async function SearchSection({ ctx, query }: { ctx: OrgContext; query: string }) {
  let data: SimpleSearchDTO;
  try {
    data = await callEdgeApi<SimpleSearchDTO>(ctx, "/suppliers/search", { query: { q: query }, timeoutMs: 55_000 });
  } catch (e) {
    return (
      <Callout tone="danger" title="Recherche interrompue" action={<ButtonLink href={`/sourcing?q=${encodeURIComponent(query)}`} variant="secondary" size="sm">Réessayer</ButtonLink>}>
        {toUserMessage(e)}
      </Callout>
    );
  }
  return (
    <div className="space-y-4">
      {data.partial ? (
        <Callout tone="warning" title="Recherche en direct incomplète">
          La recherche en direct n&apos;a pas abouti dans le délai (~35 s) : les résultats affichés sont les offres déjà enregistrées. Relancez la recherche dans un instant pour des prix plus frais.
        </Callout>
      ) : null}
      {data.total === 0 ? <NoResult data={data} /> : <SupplierSearchResults data={data} />}
      <Checked data={data} />
    </div>
  );
}

function NoResult({ data }: { data: SimpleSearchDTO }) {
  const simpler = simplerQuery(data.query);
  const failed = data.checked.filter((c) => !c.ok).length;
  return (
    <EmptyState
      icon={<SearchX className="h-8 w-8" aria-hidden="true" />}
      title={`Rien trouvé pour « ${data.query} »`}
      description={`Essayez un mot plus simple ou vérifiez l'orthographe.${failed > 0 ? ` ${failed} fournisseur${failed > 1 ? "s n'ont" : " n'a"} pas répondu : réessayez dans un instant.` : ""} Vous pouvez aussi parcourir les offres collectées ou ajouter une source.`}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {simpler ? <ButtonLink href={`/sourcing?q=${encodeURIComponent(simpler)}`}>Chercher « {simpler} »</ButtonLink> : null}
          <ButtonLink href={`/sourcing/catalog?q=${encodeURIComponent(data.query)}`} variant="secondary">
            Chercher dans les offres collectées
          </ButtonLink>
          <ButtonLink href="/suppliers" variant="ghost">
            Ajouter un fournisseur ou une source
          </ButtonLink>
        </div>
      }
    />
  );
}

function Checked({ data }: { data: SimpleSearchDTO }) {
  if (data.checked.length === 0) {
    return <p className="text-xs text-muted">Aucun fournisseur interrogé en direct pour cette recherche : seules les offres enregistrées ont été comparées.</p>;
  }
  const { answered, failed } = checkedSummary(data.checked);
  return (
    <section aria-labelledby="checked-title" className="rounded-xl border border-border bg-surface px-4 py-3">
      <h2 id="checked-title" className="text-sm font-semibold">
        Fournisseurs consultés en direct ({data.checked.length})
      </h2>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {answered.map((c) => (
          <li key={`ok-${c.supplierName}`}>
            <Badge variant="success">
              {c.supplierName} · {formatNumber(c.found)} trouvée{c.found > 1 ? "s" : ""}
            </Badge>
          </li>
        ))}
        {failed.map((c) => (
          <li key={`ko-${c.supplierName}`} title={c.message ?? undefined}>
            <Badge variant="warning">{c.supplierName} · sans réponse</Badge>
          </li>
        ))}
      </ul>
      {failed.some((c) => c.message) ? (
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {failed
            .filter((c) => c.message)
            .map((c) => (
              <li key={`msg-${c.supplierName}`}>
                {c.supplierName} : {c.message}
              </li>
            ))}
        </ul>
      ) : null}
      <p className="mt-2 text-xs text-muted">
        Détail des sources et des offres collectées : <Link href="/sourcing/catalog" className="underline">Offres collectées</Link>.
      </p>
    </section>
  );
}
