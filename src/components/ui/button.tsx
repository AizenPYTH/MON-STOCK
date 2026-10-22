import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn, safeExternalUrl } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link" | "dark" | "night";
export type ButtonSize = "sm" | "md" | "lg" | "xl";
type Variant = ButtonVariant;
type Size = ButtonSize;

/**
 * Socle commun : focus par contour (s'adapte à tout fond), pression = 1 px vers le bas,
 * désactivé = 50 %, occupé (`aria-busy`) = curseur d'attente. Le rayon et la graisse sont portés
 * par la taille et la variante (aucune classe en conflit).
 */
const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap transition-[background-color,border-color,color,filter,transform] duration-150 ease-standard active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-busy:cursor-progress [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  // Action principale : menthe, texte bleu nuit (une seule par zone).
  primary: "bg-mint font-extrabold text-night hover:bg-mint-pressed",
  // Action courante : surface blanche à filet.
  secondary: "border border-border-strong bg-surface font-bold text-foreground hover:border-border-control/50 hover:bg-surface-2",
  // Action discrète (barres d'outils, lignes de tableau).
  ghost: "font-bold text-muted-strong hover:bg-line-soft hover:text-foreground",
  // Action destructive, toujours confirmée.
  danger: "bg-danger-strong font-bold text-on-danger-strong hover:brightness-[.92]",
  // Lien d'action dans le texte.
  link: "h-auto rounded-sm px-0 font-bold text-interactive underline-offset-4 hover:text-interactive-hover hover:underline",
  // Bouton plein contrasté sur papier (ex. « Chercher une offre ») : bleu nuit en clair, clair en sombre.
  dark: "bg-inverse font-bold text-on-inverse hover:bg-inverse-hover",
  // Bouton secondaire posé sur la scène nuit.
  night: "bg-night-raised font-bold text-on-night hover:bg-night-hover",
};

/** Hauteurs : sm 32 (40 au doigt), md 40, lg 48, xl 52 (action principale des formulaires). */
const sizes: Record<Size, string> = {
  sm: "h-8 rounded-[10px] px-3 text-[13px] pointer-coarse:h-10",
  md: "h-10 rounded-xl px-4 text-sm",
  lg: "h-12 rounded-xl px-5 text-[15px]",
  xl: "h-[52px] rounded-xl px-5 text-[15px]",
};

const iconOnlySizes: Record<Size, string> = {
  sm: "w-8 px-0 pointer-coarse:w-10",
  md: "w-10 px-0",
  lg: "w-12 px-0",
  xl: "w-[52px] px-0",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string, options?: { iconOnly?: boolean }): string {
  return cn(base, variants[variant], variant === "link" ? "" : sizes[size], variant !== "link" && options?.iconOnly && iconOnlySizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Action en cours : bouton désactivé, `aria-busy`, indicateur tournant. Ne jamais afficher de succès avant la réponse. */
  loading?: boolean;
  /** Texte affiché pendant `loading` (sinon le libellé reste). */
  loadingText?: ReactNode;
  /** Bouton carré ne contenant qu'une icône : fournir `aria-label`. */
  iconOnly?: boolean;
}

export function Button({ variant = "primary", size = "md", className, type = "button", loading = false, loadingText, iconOnly = false, disabled, children, "aria-busy": ariaBusy, ...props }: ButtonProps) {
  return (
    <button type={type} {...props} className={buttonClasses(variant, size, className, { iconOnly })} disabled={disabled || loading} aria-busy={loading || ariaBusy || undefined}>
      {loading ? (
        <>
          <Loader2 aria-hidden="true" className={cn("animate-spin", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
          {iconOnly ? null : (loadingText ?? children)}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Chemin interne relatif à l'application (`/stock`, `?page=2`, `#ancre`) — jamais `//hote`. */
function isInternalHref(href: string): boolean {
  return (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) || href.startsWith("?") || href.startsWith("#");
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  iconOnly = false,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  target?: string;
  rel?: string;
  "aria-label"?: string;
  title?: string;
  iconOnly?: boolean;
}) {
  const classes = buttonClasses(variant, size, className, { iconOnly });
  if (isInternalHref(href)) {
    // typedRoutes : les routes dynamiques construites sont validées à l'exécution.
    return (
      <Link href={href as never} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  // Lien externe (souvent issu de données tierces : flux fournisseur, annonce…) :
  // uniquement http(s), ouvert dans un nouvel onglet sans accès à `window.opener`.
  const external = safeExternalUrl(href);
  if (!external) {
    return (
      <span aria-disabled="true" title="Lien indisponible (URL non sûre ou invalide)" className={buttonClasses(variant, size, cn(className, "pointer-events-none opacity-50"), { iconOnly })}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={external}
      className={classes}
      target={rest.target ?? "_blank"}
      rel={rest.rel ?? "noopener noreferrer"}
      aria-label={rest["aria-label"]}
      title={rest.title}
    >
      {children}
    </a>
  );
}
