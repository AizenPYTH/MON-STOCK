import type { Metadata } from "next";
import { History } from "lucide-react";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { PageHeader, Callout } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getAdvisorStatus, getConversation } from "@/features/advisor/queries";
import { AdvisorChat, AdvisorNotConfigured, type ChatItem } from "@/features/advisor/components/advisor-chat";
import { formatNumber } from "@/lib/format";
import { toUserMessage } from "@/lib/errors";

export const metadata: Metadata = { title: "Conseiller IA" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdvisorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const requested = typeof sp.conversation === "string" && UUID.test(sp.conversation) ? sp.conversation : null;

  const [statusView, conversation] = await Promise.all([
    getAdvisorStatus(ctx),
    requested
      ? getConversation(ctx, requested).then(
          (c) => ({ c, e: null as string | null }),
          (e: unknown) => ({ c: null, e: toUserMessage(e) }),
        )
      : Promise.resolve({ c: null, e: null as string | null }),
  ]);
  const status = statusView.status;
  const configured = status ? status.configured : null;
  const items: ChatItem[] = (conversation.c?.messages ?? []).map((m) => ({ key: m.id, role: m.role, content: m.content, cards: m.cards, sources: m.sources, interrupted: m.interrupted }));
  const missingConversation = requested !== null && !conversation.c && !conversation.e;

  return (
    <>
      <PageHeader
        title="Conseiller"
        description="Questions sur vos ventes, marges, stock, commandes et expéditions : réponses fondées sur vos données réelles, actions préparées que vous confirmez."
        actions={
          <ButtonLink href="/advisor/history" variant="secondary">
            <History aria-hidden="true" className="h-4 w-4" /> Historique
          </ButtonLink>
        }
      />

      <div className="mb-4 space-y-3">
        {configured === false ? <AdvisorNotConfigured /> : null}
        {statusView.error ? (
          <Callout tone="warning" title="État du conseiller indisponible.">
            {statusView.error} Vous pouvez tout de même poser une question : un message clair s&apos;affichera si le conseiller ne peut pas répondre.
          </Callout>
        ) : null}
        {conversation.e ? <Callout tone="danger" title="Conversation illisible.">{conversation.e}</Callout> : null}
        {missingConversation ? <Callout tone="neutral" title="Conversation introuvable.">Elle a peut-être été supprimée. Une nouvelle conversation est ouverte.</Callout> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <AdvisorChat
          key={conversation.c?.conversation.id ?? "new"}
          organizationName={ctx.organization.name}
          initialConversationId={conversation.c?.conversation.id ?? null}
          initialItems={items}
          configured={configured}
          canConfirm={canWrite(ctx.role)}
          perUserPerHour={status?.limits.perUserPerHour ?? null}
          usedThisHour={statusView.usedThisHour}
        />

        <aside className="space-y-4">
          <Card>
            <CardHeader title="État" className="py-3" />
            <CardContent className="space-y-1.5 py-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted">Conseiller</span>
                <span>{configured === null ? "—" : configured ? <span className="text-success">Activé</span> : <span className="text-warning">Non activé</span>}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Modèle</span>
                <span className="truncate font-mono text-xs">{status?.model ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Par utilisateur</span>
                <span className="tnum">{status ? `${formatNumber(status.limits.perUserPerHour)} questions / heure` : "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Par organisation</span>
                <span className="tnum">{status ? `${formatNumber(status.limits.perOrganizationPerDay)} demandes / jour` : "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Message</span>
                <span className="tnum">{status ? `${formatNumber(status.limits.maxMessageChars)} caractères max.` : "—"}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Comment ça marche" className="py-3" />
            <CardContent className="space-y-2 py-3 text-xs text-muted-strong">
              <p>Les chiffres sont calculés par le serveur MON STOCK sur vos données, avec vos droits. Une donnée absente est signalée, jamais inventée.</p>
              <p>Le conseiller peut préparer un ajustement de stock ou un changement de prix : rien n&apos;est modifié tant que vous n&apos;avez pas cliqué sur « Confirmer ». Une action préparée expire après 10 minutes.</p>
              <p>Un « oui » écrit dans la conversation n&apos;exécute rien. Vos conversations ne sont visibles que par vous.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
