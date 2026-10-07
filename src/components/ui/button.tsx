import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

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
}) {
  const external = /^https?:\/\//.test(href);
  if (external) {
    return (
      <a href={href} className={buttonClasses(variant, size, className)} target={rest.target ?? "_blank"} rel={rest.rel ?? "noopener noreferrer"}>
        {children}
      </a>
    );
  }
  // typedRoutes : les routes dynamiques construites sont validées à l'exécution.
  return (
    <Link href={href as never} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
