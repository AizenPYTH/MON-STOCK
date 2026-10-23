import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare, MessageSquarePlus } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { MonoTitle, Panel, Paper, Scene, SceneHeader } from "@/components/instrument";
import { EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { listConversations } from "@/features/advisor/queries";
import { DeleteConversationButton } from "@/features/advisor/components/delete-conversation-button";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversations du conseiller" };

/** Historique des conversations du conseiller (les vôtres uniquement : RLS), 50 plus récentes. */
export default async function AdvisorHistoryPage() {
  const ctx = await requireOrgContext();
  const conversations = await listConversations(ctx);

  return (
    <>
      <Scene>
        <SceneHeader
          back={{ href: "/advisor", label: "Conseiller" }}
          eyebrow="Conseiller IA · vos données"
          title="Conversations"
          description="Vos conversations avec le conseiller (visibles par vous seul), de la plus récente à la plus ancienne."
          actions={
            <ButtonLink href="/advisor">
              <MessageSquarePlus aria-hidden="true" className="h-4 w-4" /> Nouvelle conversation
            </ButtonLink>
          }
        />
      </Scene>
      <Paper>
        <div className="mx-auto flex max-w-[820px] flex-col gap-2.5">
          <MonoTitle title="Historique" count={conversations.length} aside={conversations.length === 50 ? "50 plus récentes" : undefined} />
          {conversations.length === 0 ? (
            <EmptyState icon={<MessageSquare aria-hidden="true" />} title="Aucune conversation" description="Posez votre première question au conseiller." action={<ButtonLink href="/advisor">Nouvelle conversation</ButtonLink>} />
          ) : (
            <Panel as="section">
              <ul>
                {conversations.map((c, i) => (
                  <li key={c.id} className={cn("flex items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-surface-2", i > 0 && "border-t border-line-soft")}>
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-3 text-muted">
                      <MessageSquare className="h-4 w-4" />
                    </span>
                    <Link href={`/advisor?conversation=${c.id}` as never} className="min-w-0 flex-1 rounded-lg py-1.5 hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&:hover>span:first-child]:underline">
                      <span className="block truncate text-sm font-bold text-foreground">{c.title}</span>
                      <span className="ms-code mt-0.5 block text-[10.5px] text-ink-3" title={formatDateTime(c.lastMessageAt)}>
                        {formatRelative(c.lastMessageAt)}
                      </span>
                    </Link>
                    <DeleteConversationButton conversationId={c.id} title={c.title} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {conversations.length === 50 ? <p className="text-xs font-semibold text-ink-3">Seules les 50 conversations les plus récentes sont affichées.</p> : null}
        </div>
      </Paper>
    </>
  );
}
