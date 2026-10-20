import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare, Plus } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listConversations } from "@/features/advisor/queries";
import { DeleteConversationButton } from "@/features/advisor/components/delete-conversation-button";
import { formatDateTime, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Conversations du conseiller" };

/** Historique des conversations du conseiller (les vôtres uniquement : RLS), 50 plus récentes. */
export default async function AdvisorHistoryPage() {
  const ctx = await requireOrgContext();
  const conversations = await listConversations(ctx);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/advisor" className="hover:underline">
            Conseiller
          </Link>
        }
        title="Conversations"
        description="Vos conversations avec le conseiller (visibles par vous seul), de la plus récente à la plus ancienne."
        actions={
          <ButtonLink href="/advisor">
            <Plus aria-hidden="true" className="h-4 w-4" /> Nouvelle conversation
          </ButtonLink>
        }
      />
      {conversations.length === 0 ? (
        <EmptyState title="Aucune conversation" description="Posez votre première question au conseiller." action={<ButtonLink href="/advisor">Nouvelle conversation</ButtonLink>} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {conversations.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <MessageSquare aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
                <Link href={`/advisor?conversation=${c.id}` as never} className="min-w-0 flex-1 rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="block truncate text-sm font-medium text-foreground">{c.title}</span>
                  <span className="block text-xs text-muted" title={formatDateTime(c.lastMessageAt)}>
                    {formatRelative(c.lastMessageAt)} · {formatDateTime(c.lastMessageAt)}
                  </span>
                </Link>
                <DeleteConversationButton conversationId={c.id} title={c.title} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {conversations.length === 50 ? <p className="mt-3 text-xs text-muted">Seules les 50 conversations les plus récentes sont affichées.</p> : null}
    </>
  );
}
