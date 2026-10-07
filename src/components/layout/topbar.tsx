import { LogOut, ChevronDown } from "lucide-react";
import type { OrgContext } from "@/features/auth/dal";
import { signOutAction } from "@/features/auth/actions";
import { switchOrganizationAction } from "@/features/organizations/actions";

export function Topbar({ ctx }: { ctx: OrgContext }) {
  const roleLabel: Record<string, string> = { owner: "Propriétaire", admin: "Administrateur", member: "Membre", viewer: "Lecture seule" };
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {ctx.memberships.length > 1 ? (
          <form action={switchOrganizationAction} className="relative">
            <select
              name="organization_id"
              defaultValue={ctx.organization.id}
              className="h-8 appearance-none rounded-lg border border-border bg-surface pl-2.5 pr-7 text-sm font-medium"
            >
              {ctx.memberships.map((m) => (
                <option key={m.organization.id} value={m.organization.id}>
                  {m.organization.is_demo ? "DEMO · " : ""}
                  {m.organization.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-muted" />
            <button type="submit" className="ml-2 text-xs text-muted underline hover:text-foreground">
              Changer
            </button>
          </form>
        ) : (
          <span className="truncate text-sm font-medium">{ctx.organization.name}</span>
        )}
        {ctx.organization.is_demo ? <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">DEMO</span> : null}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium leading-tight">{ctx.profile.full_name ?? ctx.user.email}</div>
          <div className="text-xs text-muted">{roleLabel[ctx.role] ?? ctx.role}</div>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground" aria-label="Se déconnecter" title="Se déconnecter">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}
