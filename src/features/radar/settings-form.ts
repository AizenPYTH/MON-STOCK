/**
 * Formulaire « Paramètres de coûts » → RadarCostSettings (PUR). Champ vide = inconnu (null), jamais
 * 0 ; bornes identiques au schéma du serveur (radarSettingsSchema), messages en français.
 */
import type { RadarCostSettings } from "@/features/mobile-api/contract";
import { COST_FIELDS, parseSetting } from "@/features/radar/labels";

export type SettingsFormResult = { ok: true; settings: RadarCostSettings } | { ok: false; error: string; fieldErrors: Record<string, string[]> };

type FormLike = { get(name: string): FormDataEntryValue | null };

const text = (f: FormLike, name: string): string => {
  const v = f.get(name);
  return typeof v === "string" ? v : "";
};

export function parseSettingsForm(form: FormLike): SettingsFormResult {
  const fieldErrors: Record<string, string[]> = {};
  const regime = text(form, "vatRegime");
  const vatRegime = regime === "normal" || regime === "margin" || regime === "franchise" ? regime : null;
  if (regime && !vatRegime) fieldErrors.vatRegime = ["Régime de TVA inconnu."];
  const rec = text(form, "vatRecoverable");
  const vatRecoverable = rec === "yes" ? true : rec === "no" ? false : null;
  const numbers: Partial<Record<(typeof COST_FIELDS)[number]["key"], number | null>> = {};
  for (const f of COST_FIELDS) {
    const v = parseSetting(text(form, f.key));
    if (v === "invalid") fieldErrors[f.key] = ["Nombre positif attendu (ex. 12,5), ou laissez vide si inconnu."];
    else if (v !== null && v > f.max) fieldErrors[f.key] = [`Valeur trop élevée : ${f.max} au maximum.`];
    else numbers[f.key] = v;
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, error: "Vérifiez les champs signalés.", fieldErrors };
  return {
    ok: true,
    settings: {
      vatRegime,
      vatRecoverable,
      vatRate: numbers.vatRate ?? null,
      marketplaceFeePercent: numbers.marketplaceFeePercent ?? null,
      paymentFeePercent: numbers.paymentFeePercent ?? null,
      paymentFeeFixed: numbers.paymentFeeFixed ?? null,
      shippingToCustomer: numbers.shippingToCustomer ?? null,
      packagingCost: numbers.packagingCost ?? null,
      returnProvisionPercent: numbers.returnProvisionPercent ?? null,
      importDutyPercent: numbers.importDutyPercent ?? null,
    },
  };
}

/** Quantité du brouillon de commande : entier ≥ MOQ (≥ 1) et ≤ 100 000. */
export function parseDraftQuantity(raw: FormDataEntryValue | null, moq: number | null): { ok: true; quantity: number } | { ok: false; error: string } {
  const min = Math.max(1, moq ?? 1);
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim().replace(",", ".")) : NaN;
  if (!Number.isInteger(n)) return { ok: false, error: "Indiquez une quantité entière." };
  if (n < min) return { ok: false, error: `Quantité minimale de commande : ${min}.` };
  if (n > 100_000) return { ok: false, error: "Quantité trop élevée (100 000 au maximum)." };
  return { ok: true, quantity: n };
}
