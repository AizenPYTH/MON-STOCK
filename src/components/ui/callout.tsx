import type { ReactNode } from "react";
import { CircleCheck, Info, OctagonAlert, TriangleAlert, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalloutTone = "info" | "warning" | "danger" | "success" | "neutral";

const TONES: Record<CalloutTone, { box: string; ink: string; icon: typeof Info }> = {
  info: { box: "border-info-line bg-info-soft", ink: "text-info-ink", icon: Info },
  warning: { box: "border-warning-line bg-warning-soft", ink: "text-warning-ink", icon: TriangleAlert },
  danger: { box: "border-danger-line bg-danger-soft", ink: "text-danger-ink", icon: OctagonAlert },
  success: { box: "border-success-line bg-success-soft", ink: "text-success-ink", icon: CircleCheck },
  neutral: { box: "border-border bg-surface-2", ink: "text-muted-strong", icon: Lightbulb },
};

export type CalloutProps = {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Icône de remplacement ; `false` pour la masquer. Par défaut : icône du ton (le sens ne repose jamais sur la couleur seule). */
  icon?: ReactNode | false;
  role?: "alert" | "status" | "note";
};

/** Encadré d'information contextuelle (statique). Pour un message qui apparaît suite à une action, utiliser `Alert`. */
export function Callout({ tone = "info", title, children, action, className, icon, role }: CalloutProps) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div role={role} className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 rounded-2xl border px-4 py-3 text-sm", t.box, t.ink, className)}>
      {icon === false ? null : <span aria-hidden="true" className="mt-0.5 flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon ?? <Icon />}</span>}
      <div className="min-w-0 flex-1 basis-56">
        {title ? <div className="font-bold">{title}</div> : null}
        {children ? <div className={cn("font-medium", title ? "mt-0.5" : "")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

/** Message annoncé aux lecteurs d'écran (role="alert" pour danger / avertissement, "status" sinon). */
export function Alert(props: Omit<CalloutProps, "role">) {
  const tone = props.tone ?? "info";
  return <Callout {...props} role={tone === "danger" || tone === "warning" ? "alert" : "status"} />;
}
