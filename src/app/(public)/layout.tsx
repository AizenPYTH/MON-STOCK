import type { ReactNode } from "react";
import { PublicFooter, PublicHeader } from "@/components/public/public-chrome";
import { ChromeSwitch } from "@/components/public/chrome-switch";
import { FloatingHeader } from "@/components/public/home/floating-header";
import { SiteFooter } from "@/components/public/home/site-footer";

/** Site public (accueil, pages légales, support) : accessible sans compte. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ChromeSwitch home={<FloatingHeader />} other={<PublicHeader />} />
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <ChromeSwitch home={<SiteFooter />} other={<PublicFooter />} />
    </>
  );
}
