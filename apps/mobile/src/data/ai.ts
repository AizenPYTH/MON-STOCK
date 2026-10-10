import type { AssistantMessageDTO, AssistantReplyDTO, ProductDraftDTO } from "@/features/mobile-api/contract";
import { PRODUCT_CATEGORIES } from "@/features/stock/product-form";
import { newVariantDraft, withSuggestedCode, type VariantDraft } from "~/components/product-form";
import { callApi } from "~/lib/api";

/**
 * IA (exécutée sur le serveur MON STOCK, jamais dans le téléphone : la clé de l'API Claude reste
 * un secret serveur). Le téléphone envoie le texte dicté ou la question, reçoit un brouillon ou
 * une réponse fondée sur les données du compte.
 */

export function draftProduct(organizationId: string, text: string): Promise<ProductDraftDTO> {
  return callApi<ProductDraftDTO>("/ai/product-draft", { method: "POST", organizationId, body: { text }, timeoutMs: 90_000 });
}

export function askAssistant(organizationId: string, messages: AssistantMessageDTO[]): Promise<AssistantReplyDTO> {
  return callApi<AssistantReplyDTO>("/ai/assistant", { method: "POST", organizationId, body: { messages }, timeoutMs: 120_000 });
}

/** Montant → texte du formulaire (« 429,9 ») ; vide si inconnu (jamais 0 par défaut). */
function moneyText(n: number | null): string {
  return n === null ? "" : String(Math.round(n * 100) / 100).replace(".", ",");
}

export interface ProductFormPrefill {
  brand: string;
  model: string;
  name: string;
  category: string;
  variants: VariantDraft[];
  notes: string[];
}

/** Brouillon de l'IA → état du formulaire « Nouveau produit » (l'utilisateur vérifie avant de créer). */
export function draftToForm(d: ProductDraftDTO): ProductFormPrefill {
  const identity = { brand: d.brand ?? "", model: d.model ?? "", name: d.name ?? "" };
  const known = PRODUCT_CATEGORIES.find((c) => c.toLowerCase() === (d.category ?? "").trim().toLowerCase());
  const variants = (d.variants.length ? d.variants : [null]).map((v) =>
    withSuggestedCode(
      newVariantDraft(
        v
          ? {
              storage: v.storage ?? "",
              color: v.color ?? "",
              grade: v.grade ?? "",
              condition: v.condition,
              cost_price: moneyText(v.costPrice),
              sale_price: moneyText(v.salePrice),
              initial_quantity: v.initialQuantity === null ? "" : String(v.initialQuantity),
            }
          : undefined,
      ),
      identity,
    ),
  );
  return { ...identity, category: known ?? d.category ?? "", variants, notes: d.notes };
}

/** Historique envoyé à l'assistant : alternance stricte, 20 messages au plus, se termine par la question. */
export function conversationForApi(history: readonly AssistantMessageDTO[], question: string): AssistantMessageDTO[] {
  const all = [...history, { role: "user" as const, content: question.trim() }];
  const merged: AssistantMessageDTO[] = [];
  for (const m of all) {
    const content = m.content.trim().slice(0, 4000);
    if (!content) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n${content}`.slice(0, 4000);
    else merged.push({ role: m.role, content });
  }
  while (merged.length && merged[0]!.role !== "user") merged.shift();
  let tail = merged.slice(-20);
  while (tail.length && tail[0]!.role !== "user") tail = tail.slice(1);
  return tail;
}
