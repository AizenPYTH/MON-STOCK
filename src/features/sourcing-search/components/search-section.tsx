import "server-only";
import type { ReactNode } from "react";
import Link from "next/link";
import { RotateCw, SearchX, TriangleAlert, WifiOff } from "lucide-react";
import type { OrgContext } from "@/features/auth/dal";
import type { SimpleSearchDTO } from "@/features/mobile-api/contract";
import { Paper } from "@/components/instrument";
import { buttonClasses } from "@/components/ui/button";
import { callEdgeApi } from "@/lib/edge-api";
import { toUserMessage } from "@/lib/errors";
import { simplerQuery } from "@/features/sourcing-search/display";
import { SourcingScene } from "@/features/sourcing-search/components/search-scene";
import { CheckedLine, SupplierSearchView } from "@/features/sourcing-search/components/search-results";

/** État d'attente honnête : aucune progression simulée, seulement ce qui se passe et la durée maximale. */
export function SearchPending({ query }: { query: string }) {
  return (
    <>
      <SourcingScene
        query={query}
        below={
          <p role="status" className="text-[13px] font-semibold leading-[18px] text-on-night-muted">
            Recherche de « {query} » chez vos fournisseurs · jusqu&apos;à ~35 s. Les résultats s&apos;affichent quand toutes les sources ont répondu ; au-delà, les offres déjà enregistrées.
          </p>
        }
      />
      <Paper>
        <div role="progressbar" aria-label="Recherche en cours" className="flex flex-col gap-2.5">
          <span className="ms-pulse block h-[38px] w-full max-w-[420px] rounded-xl bg-track" />
          <span className="ms-pulse block h-44 rounded-2xl bg-track" />
          <span className="ms-pulse block h-44 rounded-2xl bg-line-soft" />
        </div>
      </Paper>
    </>
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
      <>
        <SourcingScene query={query} below={<p className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-amber">Recherche interrompue · « {query} »</p>} />
        <Paper>
          <StateCard
            icon={<WifiOff aria-hidden="true" className="h-6 w-6" />}
            tone="danger"
            title="La recherche n'a pas abouti"
            text={`${toUserMessage(e)} Aucune offre n'est affichée tant que vos fournisseurs n'ont pas été consultés.`}
            actions={
              <>
                <Link href={`/sourcing?q=${encodeURIComponent(query)}`} className={buttonClasses("primary", "md")}>
                  <RotateCw aria-hidden="true" className="h-4 w-4" /> Réessayer
                </Link>
                <Link href={`/sourcing/catalog?q=${encodeURIComponent(query)}`} className={buttonClasses("secondary", "md")}>
                  Chercher dans les offres collectées
                </Link>
              </>
            }
          />
        </Paper>
      </>
    );
  }
  const partial = data.partial ? (
    <p role="status" className="mb-4 flex items-start gap-2.5 rounded-2xl border border-warning-line bg-warning-soft px-3.5 py-3 text-sm font-semibold leading-5 text-warning-ink">
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      La recherche en direct n&apos;a pas abouti dans le délai (~35 s) : les résultats affichés sont les offres déjà enregistrées. Relancez la recherche dans un instant pour des prix plus frais.
    </p>
  ) : null;
  if (data.total === 0) return <NoResult data={data} notice={partial} />;
  return <SupplierSearchView data={data} notice={partial} />;
}

function NoResult({ data, notice }: { data: SimpleSearchDTO; notice: ReactNode }) {
  const simpler = simplerQuery(data.query);
  const failed = data.checked.filter((c) => !c.ok).length;
  return (
    <>
      <SourcingScene query={data.query} below={<p className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-on-night-muted">0 offre · « {data.query} »</p>} />
      <Paper>
        {notice}
        <StateCard
          icon={<SearchX aria-hidden="true" className="h-6 w-6" />}
          title={`Rien trouvé pour « ${data.query} »`}
          text={`Essayez un mot plus simple ou vérifiez l'orthographe.${failed > 0 ? ` ${failed} fournisseur${failed > 1 ? "s n'ont" : " n'a"} pas répondu : réessayez dans un instant.` : ""}`}
          actions={
            <>
              {simpler ? (
                <Link href={`/sourcing?q=${encodeURIComponent(simpler)}`} className={buttonClasses("primary", "md")}>
                  Chercher « {simpler} »
                </Link>
              ) : null}
              <Link href={`/sourcing/catalog?q=${encodeURIComponent(data.query)}`} className={buttonClasses("secondary", "md")}>
                Chercher dans les offres collectées
              </Link>
              <Link href="/suppliers" className={buttonClasses("ghost", "md")}>
                Ajouter une source
              </Link>
            </>
          }
        />
        <CheckedLine checked={data.checked} />
      </Paper>
    </>
  );
}

function StateCard({ icon, title, text, actions, tone = "neutral" }: { icon: ReactNode; title: string; text: string; actions: ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <div className="ms-fade mx-auto flex max-w-[640px] flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-7 text-center">
      <span className={tone === "danger" ? "flex h-12 w-12 items-center justify-center rounded-[15px] bg-danger-soft text-danger-ink" : "flex h-12 w-12 items-center justify-center rounded-[15px] bg-line-soft text-muted"}>{icon}</span>
      <h2 className="text-[17px] font-bold leading-[22px]">{title}</h2>
      <p className="text-sm font-medium leading-5 text-muted">{text}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>
    </div>
  );
}
