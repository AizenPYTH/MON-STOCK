import type { Metadata } from "next";
import { requireOrgContext, isAdmin } from "@/features/auth/dal";
import { Crown, Eye, Mail, ShieldCheck, User, UserMinus } from "lucide-react";
import { Callout } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit-button";
import { Select } from "@/components/ui/form";
import { initials, MonoTitle, Panel } from "@/components/instrument";
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
        <MonoTitle title="Membres" count={memberList.length} as="div" />
        <h3 id="members-title" className="sr-only">
          Membres
        </h3>
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {memberList.map((m) => {
              const profile = m.profile;
              const self = m.user_id === ctx.user.id;
              const name = profile?.full_name ?? profile?.email ?? m.user_id;
              const hasName = Boolean(profile?.full_name ?? profile?.email);
              const canEdit = admin && !self && (ctx.role === "owner" || m.role !== "owner");
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
                  <span className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
                    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-selection text-xs font-extrabold text-foreground">
                      {initials(profile?.full_name ?? profile?.email ?? "?")}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("flex min-w-0 items-center gap-1.5 text-[15px] font-semibold", hasName ? "text-foreground" : "text-muted")} title={name}>
                        <span className="truncate">{hasName ? name : "Profil incomplet"}</span>
                        {self ? <Badge variant="neutral">vous</Badge> : null}
                      </span>
                      <span className="block truncate text-[12.5px] font-semibold text-ink-3">
                        {hasName ? null : <span className="ms-code font-medium">{m.user_id} · </span>}
                        {profile?.email && profile.full_name ? `${profile.email} · ` : ""}membre depuis {formatDate(m.created_at)}
                      </span>
                    </span>
                  </span>
                  {/* Personne ne modifie son propre rôle ; seul un propriétaire touche au rôle propriétaire (règles doublées en base). */}
                  <span className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:pl-[52px]">
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
                      <RoleBadge role={m.role} />
                    )}
                    {admin && !self ? (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <SubmitButton confirmMessage="Retirer ce membre de l'organisation ?" variant="ghost" size="md" className="text-danger hover:bg-danger-soft hover:text-danger" aria-label={`Retirer ${name}`}>
                          <UserMinus aria-hidden="true" className="h-4 w-4" />
                          Retirer
                        </SubmitButton>
                      </form>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </section>

      {admin ? (
        <section aria-labelledby="invites-title" className="space-y-2">
          <MonoTitle title="Invitations en attente" count={inviteList.length} as="div" />
          <h3 id="invites-title" className="sr-only">
            Invitations en attente
          </h3>
          {inviteList.length === 0 ? (
            <Panel className="flex items-center gap-3 px-4 py-4 text-sm font-semibold text-muted">
              <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-3" />
              Aucune invitation en attente.
            </Panel>
          ) : (
            <Panel className="overflow-hidden">
              <ul className="divide-y divide-line-soft">
                {inviteList.map((inv) => {
                  const expired = isExpired(inv.expires_at);
                  const link = `${appUrl}/invite/${inv.token}`;
                  return (
                    <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
                      <span className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
                        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border-control/50 text-xs font-extrabold text-ink-3">
                          {initials(inv.email)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold text-foreground">{inv.email}</span>
                          <span className="block text-[12.5px] font-semibold text-ink-3">Invitation · aucun e-mail envoyé</span>
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:pl-[52px]">
                        <RoleBadge role={inv.role} />
                        {expired ? (
                          <StatusBadge tone="warning">Expirée</StatusBadge>
                        ) : (
                          <StatusBadge tone="pending">Expire le {formatDate(inv.expires_at)}</StatusBadge>
                        )}
                        {!expired ? <CopyLinkButton value={link} /> : null}
                        <form action={revokeInvitationAction}>
                          <input type="hidden" name="id" value={inv.id} />
                          <SubmitButton confirmMessage="Révoquer cette invitation ? Le lien ne fonctionnera plus." variant="ghost" size="md" className="text-danger hover:bg-danger-soft hover:text-danger" aria-label={`Révoquer l'invitation de ${inv.email}`}>
                            Révoquer
                          </SubmitButton>
                        </form>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </section>
      ) : null}

      {admin ? <InviteMemberForm /> : null}

      <section aria-labelledby="roles-title" className="space-y-2">
        <MonoTitle title="Ce que permet chaque rôle" as="div" />
        <h3 id="roles-title" className="sr-only">
          Ce que permet chaque rôle
        </h3>
        <Panel className="overflow-hidden">
          <dl className="grid sm:grid-cols-2">
            {ROLE_HELP.map((r) => (
              <div key={r.role} className="flex flex-col gap-1.5 border-b border-line-soft px-4 py-3.5 sm:odd:border-r">
                <dt>
                  <RoleBadge role={r.role} />
                </dt>
                <dd className="text-[13px] font-semibold leading-[18px] text-muted">{r.text}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </section>
    </>
  );
}

const ROLE_HELP = [
  { role: "owner", text: "Tous les droits, y compris attribuer ou retirer le rôle propriétaire. L'organisation garde toujours au moins un propriétaire." },
  { role: "admin", text: "Gère les membres, les invitations, les paramètres de l'organisation et la connexion eBay." },
  { role: "member", text: "Consulte et modifie les données (stock, ventes, sourcing) et lance les synchronisations." },
  { role: "viewer", text: "Consulte les données sans pouvoir rien modifier." },
] as const;

/** Rôle : pastille neutre (le rôle n'est pas un signal), le propriétaire en aplat contrasté. */
function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={role === "owner" ? "accent" : role === "viewer" ? "outline" : "neutral"} size="md">
      {role === "owner" ? <Crown aria-hidden="true" /> : role === "admin" ? <ShieldCheck aria-hidden="true" /> : role === "viewer" ? <Eye aria-hidden="true" /> : <User aria-hidden="true" />}
      {ROLE_LABEL[role] ?? role}
    </Badge>
  );
}
