import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn, safeExternalUrl } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link" | "dark" | "night";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<Variant, string> = {
  // v5 : action principale menthe (texte bleu nuit), secondaire blanche à filet, sans ombre.
  primary: "bg-mint text-night font-extrabold hover:bg-mint-pressed",
  secondary: "bg-surface text-foreground border border-border hover:bg-line-soft",
  ghost: "text-muted-strong hover:bg-line-soft hover:text-foreground",
  danger: "bg-danger text-white hover:bg-[#962f2f]",
  link: "text-foreground underline-offset-2 hover:underline px-0 h-auto",
  // bouton sombre sur papier (ex. « Chercher une offre »)
  dark: "bg-night text-on-night hover:bg-night-raised",
  // bouton secondaire posé sur la scène nuit
  night: "bg-night-raised text-on-night hover:bg-night-hover",
};

const sizes: Record<Size, string> = {
  sm: "h-8 rounded-[10px] px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(base, variants[variant], variant === "link" ? "" : sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
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
}) {
  if (isInternalHref(href)) {
    // typedRoutes : les routes dynamiques construites sont validées à l'exécution.
    return (
      <Link href={href as never} className={buttonClasses(variant, size, className)} {...rest}>
        {children}
      </Link>
    );
  }
  // Lien externe (souvent issu de données tierces : flux fournisseur, annonce…) :
  // uniquement http(s), ouvert dans un nouvel onglet sans accès à `window.opener`.
  const external = safeExternalUrl(href);
  if (!external) {
    return (
      <span aria-disabled="true" title="Lien indisponible (URL non sûre ou invalide)" className={buttonClasses(variant, size, cn(className, "pointer-events-none opacity-50"))}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={external}
      className={buttonClasses(variant, size, className)}
      target={rest.target ?? "_blank"}
      rel={rest.rel ?? "noopener noreferrer"}
      aria-label={rest["aria-label"]}
      title={rest.title}
    >
      {children}
    </a>
  );
}
