import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn, safeExternalUrl } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-foreground text-white hover:bg-zinc-800 shadow-sm",
  secondary: "bg-surface text-foreground border border-border hover:bg-surface-muted shadow-sm",
  ghost: "text-muted-strong hover:bg-surface-muted hover:text-foreground",
  danger: "bg-danger text-white hover:bg-red-700 shadow-sm",
  link: "text-accent hover:underline px-0 h-auto",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-sm",
  lg: "h-10 px-4 text-sm",
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
