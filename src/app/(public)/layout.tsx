import type { ReactNode } from "react";
import { PublicFooter, PublicHeader } from "@/components/public/public-chrome";

/** Site public (accueil, pages légales, support) : accessible sans compte. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <PublicFooter />
    </>
  );
}
