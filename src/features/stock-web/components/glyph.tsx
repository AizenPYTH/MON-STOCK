import { BatteryMedium, Cable, Camera, Cpu, Gamepad2, Headphones, Laptop, MonitorSmartphone, Package, Shield, Smartphone, Tablet, Watch, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryGlyph, type GlyphKey } from "@/features/stock-web/list.pure";

const ICONS: Record<GlyphKey, LucideIcon> = {
  phone: Smartphone,
  tablet: Tablet,
  laptop: Laptop,
  audio: Headphones,
  watch: Watch,
  screen: MonitorSmartphone,
  battery: BatteryMedium,
  cable: Cable,
  case: Shield,
  console: Gamepad2,
  camera: Camera,
  part: Cpu,
  generic: Package,
};

/** Vignette = pictogramme de la catégorie (jamais de fausse photo produit). */
export function CategoryGlyph({ category, productName, size = 38, className }: { category: string | null | undefined; productName?: string | null; size?: number; className?: string }) {
  const Icon = ICONS[categoryGlyph(category, productName)];
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center rounded-[10px] border border-line-soft bg-background text-muted", className)} style={{ width: size, height: size }}>
      <Icon className={size >= 36 ? "h-[18px] w-[18px]" : "h-4 w-4"} strokeWidth={1.8} />
    </span>
  );
}
