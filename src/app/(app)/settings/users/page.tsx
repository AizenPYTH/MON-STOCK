import type { Metadata } from "next";
import { requireOrgContext, isAdmin } from "@/features/auth/dal";
import { Callout } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/submit-button";
import { Select } from "@/components/ui/form";
import { initials, Panel } from "@/components/instrument";
import { changeMemberRoleAction, removeMemberAction, revokeInvitationAction } from "@/features/organizations/actions";
import { feedbackFor } from "@/features/organizations/feedback";
import { CopyLinkButton } from "@/features/organizations/components/copy-link-button";
import { InviteMemberForm } from "@/features/organizations/components/invite-member-form";
import { SettingsSectionHeader } from "@/features/organizations/components/settings-section-header";
import { formatDate } from "@/lib/format";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Membres et invitations" };

const ROLE_LABEL: Record<string, string> = { owner: "Propriétaire", admin: "Administrateur", member: "Membre", viewer: "Lecture seule" };

/** Invitation expirée (date passée) : son lien ne fonctionne plus, il n'est donc pas proposé à la copie. */
function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireOrgContext();
  const feedback = feedbackFor((await searchParams).status);
  const admin = isAdmin(ctx.role);
  const [{ data: members }, { data: invitations }] = await Promise.all([
    ctx.supabase.from("organization_members").select("user_id, role, created_at, profile:user_profiles(email, full_name)").eq("organization_id", ctx.organization.id).order("created_at"),
    admin ? ctx.supabase.from("organization_invitations").select("*").eq("organization_id", ctx.organization.id).is("accepted_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as never[] }),
  ]);
  const appUrl = publicEnv().NEXT_PUBLIC_APP_URL;
  const memberList = members ?? [];
  const inviteList = invitations ?? [];

  return (
    <>
      <SettingsSectionHeader title="Membres et invitations" description="Les personnes qui ont accès à votre organisation et leur rôle. Les invitations en attente gardent un lien à transmettre." />
      {feedback ? (
        <div role="status" aria-live="polite">
          <Callout tone={feedback.tone}>{feedback.message}</Callout>
        </div>
      ) : null}
      {!admin ? <Callout tone="neutral">Seuls les administrateurs peuvent inviter ou modifier des membres.</Callout> : null}

      <section aria-labelledby="members-title" className="space-y-2">
        <h3 id="members-title" className="ms-mono text-[11px] leading-[14px] text-muted">
          Membres <span className="ms-code text-foreground">{memberList.length}</span>
        </h3>
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {memberList.map((m) => {
              const profile = m.profile;
              const self = m.user_id === ctx.user.id;
              const name = profile?.full_name ?? profile?.email ?? m.user_id;
              const canEdit = admin && !self && (ctx.role === "owner" || m.role !== "owner");
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-selection text-xs font-extrabold text-foreground">
                    {initials(profile?.full_name ?? profile?.email ?? "?")}
                  </span>
                  <span className="min-w-0 flex-[1_1_200px]">
                    <span className="block truncate text-[15px] font-semibold text-foreground" title={name}>
                      {name}
                      {self ? <span className="ml-1.5 text-xs font-semibold text-ink-3">(vous)</span> : null}
                    </span>
                    {profile?.email && profile.full_name ? <span className="block truncate text-[12.5px] font-semibold text-ink-3">{profile.email}</span> : null}
                  </span>
                  {/* Personne ne modifie son propre rôle ; seul un propriétaire touche au rôle propriétaire (règles doublées en base). */}
                  {canEdit ? (
                    <form action={changeMemberRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <Select name="role" defaultValue={m.role} className="h-10 w-44" aria-label={`Rôle de ${name}`}>
                        {Object.entries(ROLE_LABEL)
                          .filter(([k]) => ctx.role === "owner" || k !== "owner")
                          .map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                      </Select>
                      <SubmitButton variant="secondary" size="md" title="Enregistrer le rôle">
                        Enregistrer
                      </SubmitButton>
                    </form>
                  ) : (
                    <span className="text-[13.5px] font-bold text-foreground">{ROLE_LABEL[m.role] ?? m.role}</span>
                  )}
                  <span className="ms-code w-[120px] shrink-0 text-right text-[10.5px] uppercase text-ink-3">Depuis {formatDate(m.created_at)}</span>
                  {admin ? (
                    <span className="w-[84px] shrink-0 text-right">
                      {!self ? (
                        <form action={removeMemberAction}>
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <SubmitButton confirmMessage="Retirer ce membre de l'organisation ?" variant="ghost" size="md" className="text-danger" aria-label={`Retirer ${name}`}>
                            Retirer
                          </SubmitButton>
                        </form>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      </section>

      {admin ? (
        <section aria-labelledby="invites-title" className="space-y-2">
          <h3 id="invites-title" className="ms-mono text-[11px] leading-[14px] text-muted">
            Invitations en attente <span className="ms-code text-foreground">{inviteList.length}</span>
          </h3>
          {inviteList.length === 0 ? (
            <Panel className="px-4 py-4 text-sm font-semibold text-muted">Aucune invitation en attente.</Panel>
          ) : (
            <Panel className="overflow-hidden">
              <ul className="divide-y divide-line-soft">
                {inviteList.map((inv) => {
                  const expired = isExpired(inv.expires_at);
                  const link = `${appUrl}/invite/${inv.token}`;
                  return (
                    <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-xs font-extrabold text-ink-3">
                        {initials(inv.email)}
                      </span>
                      <span className="min-w-0 flex-[1_1_200px]">
                        <span className="block truncate text-[15px] font-semibold text-foreground">{inv.email}</span>
                        <span className="block text-[12.5px] font-semibold text-ink-3">Invitation · aucun e-mail envoyé</span>
                      </span>
                      <span className="text-[13.5px] font-bold text-foreground">{ROLE_LABEL[inv.role] ?? inv.role}</span>
                      <span className={expired ? "ms-code w-[130px] shrink-0 text-right text-[10.5px] uppercase text-warning" : "ms-code w-[130px] shrink-0 text-right text-[10.5px] uppercase text-ink-3"}>
                        {expired ? "Expirée" : `Expire le ${formatDate(inv.expires_at)}`}
                      </span>
                      {!expired ? <CopyLinkButton value={link} /> : null}
                      <form action={revokeInvitationAction}>
                        <input type="hidden" name="id" value={inv.id} />
                        <SubmitButton confirmMessage="Révoquer cette invitation ? Le lien ne fonctionnera plus." variant="ghost" size="md" className="text-danger" aria-label={`Révoquer l'invitation de ${inv.email}`}>
                          Révoquer
                        </SubmitButton>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </section>
      ) : null}

      {admin ? <InviteMemberForm /> : null}
    </>
  );
}
