import type { Metadata } from "next";
import { requireOrgContext, isAdmin } from "@/features/auth/dal";
import { PageHeader, Callout } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { InviteMemberForm } from "@/features/organizations/invite-form";
import { changeMemberRoleAction, removeMemberAction, revokeInvitationAction } from "@/features/organizations/actions";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Utilisateurs" };

const ROLE_LABEL: Record<string, string> = { owner: "Propriétaire", admin: "Administrateur", member: "Membre", viewer: "Lecture seule" };

export default async function UsersPage() {
  const ctx = await requireOrgContext();
  const admin = isAdmin(ctx.role);
  const [{ data: members }, { data: invitations }] = await Promise.all([
    ctx.supabase.from("organization_members").select("user_id, role, created_at, profile:user_profiles(email, full_name)").eq("organization_id", ctx.organization.id).order("created_at"),
    admin ? ctx.supabase.from("organization_invitations").select("*").eq("organization_id", ctx.organization.id).is("accepted_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as never[] }),
  ]);

  return (
    <>
      <PageHeader title="Utilisateurs" description="Membres de votre organisation et invitations en attente." />
      {!admin ? <Callout tone="neutral" className="mb-5">Seuls les administrateurs peuvent inviter ou modifier des membres.</Callout> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Membres" description={`${members?.length ?? 0} membre(s)`} />
            <CardContent className="p-0">
              <Table className="min-w-[520px]">
                <THead>
                  <tr>
                    <TH>Utilisateur</TH>
                    <TH>Rôle</TH>
                    <TH>Depuis</TH>
                    {admin ? <TH align="right">Actions</TH> : null}
                  </tr>
                </THead>
                <TBody>
                  {(members ?? []).map((m) => {
                    const profile = m.profile;
                    const self = m.user_id === ctx.user.id;
                    return (
                      <TR key={m.user_id}>
                        <TD>
                          <div className="font-medium">{profile?.full_name ?? profile?.email ?? m.user_id}</div>
                          <div className="text-xs text-muted">{profile?.email}</div>
                        </TD>
                        <TD>
                          {admin && !(self && m.role === "owner") ? (
                            <form action={changeMemberRoleAction} className="flex items-center gap-2">
                              <input type="hidden" name="user_id" value={m.user_id} />
                              <Select name="role" defaultValue={m.role} className="h-8 w-40">
                                {Object.entries(ROLE_LABEL).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </Select>
                              <Button type="submit" variant="secondary" size="sm">
                                OK
                              </Button>
                            </form>
                          ) : (
                            <Badge variant={m.role === "owner" ? "accent" : "neutral"}>{ROLE_LABEL[m.role] ?? m.role}</Badge>
                          )}
                        </TD>
                        <TD className="text-muted">{formatDate(m.created_at)}</TD>
                        {admin ? (
                          <TD align="right">
                            {!self ? (
                              <form action={removeMemberAction}>
                                <input type="hidden" name="user_id" value={m.user_id} />
                                <Button type="submit" variant="ghost" size="sm" className="text-danger">
                                  Retirer
                                </Button>
                              </form>
                            ) : null}
                          </TD>
                        ) : null}
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          {admin ? (
            <Card>
              <CardHeader title="Invitations en attente" />
              <CardContent className="p-0">
                {(invitations ?? []).length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted">Aucune invitation en attente.</p>
                ) : (
                  <Table className="min-w-[480px]">
                    <THead>
                      <tr>
                        <TH>Email</TH>
                        <TH>Rôle</TH>
                        <TH>Expire</TH>
                        <TH align="right">Actions</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {(invitations ?? []).map((inv) => (
                        <TR key={inv.id}>
                          <TD>{inv.email}</TD>
                          <TD>{ROLE_LABEL[inv.role] ?? inv.role}</TD>
                          <TD className="text-muted">{formatDate(inv.expires_at)}</TD>
                          <TD align="right">
                            <form action={revokeInvitationAction}>
                              <input type="hidden" name="id" value={inv.id} />
                              <Button type="submit" variant="ghost" size="sm" className="text-danger">
                                Révoquer
                              </Button>
                            </form>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
        {admin ? (
          <div>
            <InviteMemberForm />
          </div>
        ) : null}
      </div>
    </>
  );
}
