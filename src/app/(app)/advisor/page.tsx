import type { Metadata } from "next";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { Paper, Scene, SceneHeader } from "@/components/instrument";
import { getAdvisorStatus, getConversation, listConversations, type AdvisorConversation } from "@/features/advisor/queries";
import { AdvisorChat, AdvisorNotConfigured, AdvisorQuota, AdvisorStatusUnavailable, AdvisorUsageProvider } from "@/features/advisor/components/advisor-chat";
import { chatItemsFrom } from "@/features/advisor/view.pure";
import { formatRelative } from "@/lib/format";
import { toUserMessage } from "@/lib/errors";

export const metadata: Metadata = { title: "Conseiller IA" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Conseiller (v5) : scène avec le quota réel (limite du serveur, questions de l'heure), papier
 * avec l'historique des conversations à gauche et la conversation à droite.
 */
export default async function AdvisorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const requested = typeof sp.conversation === "string" && UUID.test(sp.conversation) ? sp.conversation : null;

  const [statusView, conversation, list] = await Promise.all([
    getAdvisorStatus(ctx),
    requested
      ? getConversation(ctx, requested).then(
          (c) => ({ c, e: null as string | null }),
          (e: unknown) => ({ c: null, e: toUserMessage(e) }),
        )
      : Promise.resolve({ c: null, e: null as string | null }),
    listConversations(ctx).then(
      (l): { l: AdvisorConversation[]; e: null } => ({ l, e: null }),
      (e: unknown) => ({ l: null, e: toUserMessage(e) }),
    ),
  ]);
  const status = statusView.status;
  const configured = status ? status.configured : null;
  const missingConversation = requested !== null && !conversation.c && !conversation.e;
  const history = list.l?.slice(0, 12).map((c) => ({ id: c.id, title: c.title, when: formatRelative(c.lastMessageAt) })) ?? null;

  const notices = (
    <>
      {configured === false ? <AdvisorNotConfigured /> : null}
      {statusView.error ? <AdvisorStatusUnavailable message={statusView.error} /> : null}
      {conversation.e ? (
        <p role="alert" className="self-stretch rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-[13.5px] font-semibold text-danger">
          Conversation illisible : {conversation.e}
        </p>
      ) : null}
      {missingConversation ? <p className="max-w-[92%] self-center rounded-xl bg-line-soft px-3 py-2 text-center text-[13px] font-semibold text-muted">Conversation introuvable (peut-être supprimée) : une nouvelle conversation est ouverte.</p> : null}
    </>
  );

  return (
    <AdvisorUsageProvider initialUsed={statusView.usedThisHour} limit={status?.limits.perUserPerHour ?? null}>
      <Scene className="pb-11">
        <SceneHeader eyebrow="Conseiller IA · vos données" title="Conseiller" actions={<AdvisorQuota variant="scene" />} />
      </Scene>
      <Paper className="lg:pt-5">
        <AdvisorChat
          key={conversation.c?.conversation.id ?? "new"}
          organizationName={ctx.organization.name}
          initialConversationId={conversation.c?.conversation.id ?? null}
          initialItems={chatItemsFrom(conversation.c?.messages ?? [])}
          configured={configured}
          canConfirm={canWrite(ctx.role)}
          perUserPerHour={status?.limits.perUserPerHour ?? null}
          usedThisHour={statusView.usedThisHour}
          history={history}
          historyError={list.e}
          notices={notices}
        />
      </Paper>
    </AdvisorUsageProvider>
  );
}
