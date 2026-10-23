import type { Metadata } from "next";
import { requireOrgContext } from "@/features/auth/dal";
import { DescriptionList } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { DemoBadge, MonoTitle, Panel } from "@/components/instrument";
import { formatDate } from "@/lib/format";
import { SettingsSectionHeader } from "@/features/organizations/components/settings-section-header";
import { DeleteAccountSection } from "./delete-account-section";

export const metadata: Metadata = { title: "Mon compte" };

const ROLE_LABEL: Record<string, string> = { owner: "Propriétaire", admin: "Administrateur", member: "Membre", viewer: "Lecture seule" };

/** Compte de la personne connectée (et non de l'organisation) : identité, organisations, suppression. */
export default async function AccountSettingsPage() {
  const ctx = await requireOrgContext();
  const email = ctx.user.email ?? ctx.profile.email ?? null;
  const organizations = ctx.memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, roleLabel: ROLE_LABEL[m.role] ?? m.role, isDemo: m.organization.is_demo }));
  return (
    <>
      <SettingsSectionHeader title="Mon compte" description="Votre identifiant personnel MON STOCK, le même sur le web et sur iPhone. Il est indépendant des organisations auxquelles vous appartenez." />

      <Panel className="p-4 sm:p-5">
        <DescriptionList
          items={[
            { label: "Nom", value: ctx.profile.full_name ?? <span className="text-ink-3">—</span> },
            { label: "E-mail de connexion", value: email ?? <span className="text-ink-3">—</span> },
            { label: "Compte créé le", value: ctx.user.created_at ? formatDate(ctx.user.created_at) : "—" },
            { label: "Organisation active", value: ctx.organization.name },
          ]}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
          <ButtonLink href="/update-password" variant="secondary" size="sm">
            Changer de mot de passe
          </ButtonLink>
        </div>
      </Panel>

      <section aria-labelledby="orgs-title" className="space-y-2">
        <MonoTitle title="Mes organisations" count={organizations.length} as="div" />
        <h3 id="orgs-title" className="sr-only">
          Mes organisations
        </h3>
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {organizations.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{o.name}</span>
                {o.isDemo ? <DemoBadge onNight={false} /> : null}
                {o.id === ctx.organization.id ? <span className="text-xs font-semibold text-ink-3">active</span> : null}
                <span className="text-[13px] font-bold text-muted-strong">{o.roleLabel}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <section aria-labelledby="danger-title" className="space-y-2">
        <MonoTitle title="Zone sensible" as="div" />
        <h3 id="danger-title" className="sr-only">
          Zone sensible
        </h3>
        <DeleteAccountSection email={email} organizations={organizations.map(({ name, roleLabel, isDemo }) => ({ name, roleLabel, isDemo }))} />
      </section>
    </>
  );
}
