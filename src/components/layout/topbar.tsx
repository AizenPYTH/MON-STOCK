import { LogOut } from "lucide-react";
import type { OrgContext } from "@/features/auth/dal";
import { signOutAction } from "@/features/auth/actions";
import { OrgSwitcher } from "@/components/layout/org-switcher";

const ROLE_LABEL: Record<string, string> = { owner: "Propriétaire", admin: "Administrateur", member: "Membre", viewer: "Lecture seule" };

export function Topbar({ ctx }: { ctx: OrgContext }) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {ctx.memberships.length > 1 ? (
          <OrgSwitcher
            currentId={ctx.organization.id}
            options={ctx.memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, isDemo: m.organization.is_demo }))}
          />
        ) : (
          <span className="truncate text-sm font-medium" title={ctx.organization.name}>
            {ctx.organization.name}
          </span>
        )}
        {ctx.organization.is_demo ? <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">DEMO</span> : null}
        {ctx.role === "viewer" ? (
          <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-muted-strong sm:hidden" title="Votre rôle ne permet pas de modifier les données de cette organisation.">
            Lecture seule
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden min-w-0 text-right sm:block">
          <div className="max-w-[14rem] truncate text-sm font-medium leading-tight">{ctx.profile.full_name ?? ctx.user.email}</div>
          <div className="text-xs text-muted">{ROLE_LABEL[ctx.role] ?? ctx.role}</div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </>
  );
}
