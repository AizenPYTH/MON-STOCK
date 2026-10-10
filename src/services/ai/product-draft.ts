import "server-only";
import { z } from "zod";
import { CONDITION_LABEL, MAX_VARIANTS, PRODUCT_CATEGORIES, PRODUCT_GRADES } from "@/features/stock/product-form";
import type { ProductDraftDTO } from "@/features/mobile-api/contract";
import { AppError } from "@/lib/errors";
import { AI_BETAS, AI_MODEL, aiError, claudeClient } from "./claude";

/**
 * Création de produit à la voix : la phrase dictée (transcrite sur le téléphone) est COMPRISE par
 * Claude et convertie en brouillon du formulaire « Nouveau produit » (marque, modèle, catégorie,
 * variantes avec capacité / couleur / grade / état, prix, quantités).
 *
 * Rien n'est créé ici : le brouillon pré-remplit le formulaire, l'utilisateur vérifie et confirme.
 * Aucune valeur n'est inventée : ce qui n'a pas été dit reste vide, les ambiguïtés sont signalées.
 */

const CONDITIONS = Object.keys(CONDITION_LABEL) as (keyof typeof CONDITION_LABEL)[];

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

/** Schéma imposé à la réponse (sorties structurées : JSON garanti conforme). */
export const PRODUCT_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["understood", "brand", "model", "name", "category", "variants", "notes"],
  properties: {
    understood: { type: "boolean", description: "false si la phrase ne décrit pas un produit à ajouter au stock" },
    brand: nullable({ type: "string" }),
    model: nullable({ type: "string" }),
    name: nullable({ type: "string" }),
    category: nullable({ type: "string" }),
    variants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["storage", "color", "grade", "condition", "cost_price", "sale_price", "initial_quantity"],
        properties: {
          storage: nullable({ type: "string" }),
          color: nullable({ type: "string" }),
          grade: nullable({ type: "string", enum: [...PRODUCT_GRADES] }),
          condition: { type: "string", enum: CONDITIONS },
          cost_price: nullable({ type: "number" }),
          sale_price: nullable({ type: "number" }),
          initial_quantity: nullable({ type: "integer" }),
        },
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

const money = z.number().finite().min(0).max(1_000_000).nullable();
const draftSchema = z.object({
  understood: z.boolean(),
  brand: z.string().max(120).nullable(),
  model: z.string().max(160).nullable(),
  name: z.string().max(300).nullable(),
  category: z.string().max(120).nullable(),
  variants: z
    .array(
      z.object({
        storage: z.string().max(60).nullable(),
        color: z.string().max(60).nullable(),
        grade: z.enum(PRODUCT_GRADES).nullable(),
        condition: z.enum(CONDITIONS as [keyof typeof CONDITION_LABEL, ...(keyof typeof CONDITION_LABEL)[]]),
        cost_price: money,
        sale_price: money,
        initial_quantity: z.number().int().min(0).max(1_000_000).nullable(),
      }),
    )
    .max(MAX_VARIANTS),
  notes: z.array(z.string().max(300)).max(10),
});

export function productDraftSystemPrompt(currency: string): string {
  return [
    "Tu es l'assistant de saisie de MON STOCK, un logiciel de gestion de stock pour revendeurs d'appareils électroniques (smartphones, tablettes, ordinateurs, consoles, pièces détachées).",
    "L'utilisateur DICTE à voix haute le produit qu'il veut ajouter à son stock. Le texte vient d'une reconnaissance vocale : il peut contenir des fautes, des nombres écrits en lettres, des hésitations ou des mots mal reconnus (« gigas » = Go, « IPhone » = iPhone, « tera » = To). Comprends l'intention, ne recopie pas mot à mot.",
    "",
    "Remplis le formulaire :",
    "- brand : la marque (Apple, Samsung, Google, Xiaomi, Sony, Nintendo…). Déduis-la du modèle seulement quand elle est sans ambiguïté (iPhone → Apple, Galaxy → Samsung, Pixel → Google, PlayStation → Sony, Switch → Nintendo).",
    "- model : le modèle exact avec sa graphie officielle (« iPhone 13 Pro Max », « Galaxy S23 Ultra »), sans capacité ni couleur.",
    "- name : null sauf si l'utilisateur donne explicitement un nom de produit différent de « marque + modèle ».",
    `- category : une de ${PRODUCT_CATEGORIES.map((c) => `« ${c} »`).join(", ")} ; une autre catégorie courte seulement si aucune ne convient ; null si impossible à déterminer.`,
    "- variants : une entrée par combinaison distincte (capacité, couleur, grade, état). « 3 iPhone 13 128 Go noir grade A et 2 en 256 Go bleu grade B » = 2 variantes (quantités 3 et 2). Un prix ou un état énoncé pour l'ensemble s'applique à chaque variante concernée.",
    "  - storage : format « 128 Go », « 1 To » ; null si non dit.",
    "  - color : en français, première lettre en majuscule (« Noir », « Bleu nuit », « Lumière stellaire ») ; null si non dit.",
    `  - grade : ${PRODUCT_GRADES.join(", ")} uniquement si un grade est EXPLICITEMENT énoncé (« grade A », « classé B ») ; une simple appréciation (« très bon état ») ne devient pas un grade : mets null et ajoute une note.`,
    "  - condition : new (neuf, scellé), refurbished (reconditionné), used (occasion), unknown si non dit.",
    `  - cost_price : prix d'achat unitaire en ${currency} (« acheté 300 », « je l'ai payé 300 », « coût 300 »).`,
    `  - sale_price : prix de vente unitaire en ${currency} (« je le vends 400 », « prix de vente 400 », « à revendre 400 »).`,
    "  - Un montant dont on ne sait pas s'il est d'achat ou de vente (« à 350 ») : laisse les deux à null et ajoute une note qui cite le montant. Un prix « pour le lot » : divise par la quantité seulement si la quantité est dite, et signale-le dans une note.",
    "  - initial_quantity : nombre d'unités en stock ; null si non dit (ne suppose jamais 1).",
    "- notes : phrases courtes en français pour ce que tu n'as pas pu déterminer ou ce qui est ambigu (au plus 5). Liste vide si tout est clair.",
    "- understood : false si le texte ne décrit pas un produit à ajouter (dans ce cas variants peut être vide et une note explique pourquoi).",
    "",
    "Règle absolue : n'invente AUCUNE valeur (prix, quantité, capacité, couleur, grade). Ce qui n'est pas dit reste null.",
  ].join("\n");
}

export async function draftProductFromText(text: string, currency: string): Promise<ProductDraftDTO> {
  const transcript = text.trim();
  if (transcript.length < 3) throw new AppError("VALIDATION", "Dites ou écrivez le produit à ajouter.");
  let raw: string;
  try {
    const response = await claudeClient().beta.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      betas: AI_BETAS,
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: PRODUCT_DRAFT_JSON_SCHEMA as unknown as Record<string, unknown> } },
      system: productDraftSystemPrompt(currency),
      messages: [{ role: "user", content: `Texte dicté :\n"""${transcript}"""` }],
    });
    if (response.stop_reason === "refusal") throw new AppError("VALIDATION", "Cette demande n'a pas pu être traitée par l'assistant IA. Reformulez.");
    if (response.stop_reason === "max_tokens") throw new AppError("VALIDATION", "Description trop longue : dictez moins de variantes à la fois.");
    raw = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  } catch (e) {
    throw aiError(e);
  }
  return parseProductDraft(raw, transcript);
}

/** Validation stricte de la réponse (le schéma est garanti, les bornes sont vérifiées ici). */
export function parseProductDraft(raw: string, transcript: string): ProductDraftDTO {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AppError("EXTERNAL_API", "Réponse de l'assistant IA illisible. Réessayez.");
  }
  const parsed = draftSchema.safeParse(json);
  if (!parsed.success) throw new AppError("EXTERNAL_API", "Réponse de l'assistant IA incomplète. Réessayez ou saisissez le produit à la main.");
  const d = parsed.data;
  const clean = (s: string | null) => (s && s.trim() ? s.trim() : null);
  return {
    transcript,
    understood: d.understood,
    brand: clean(d.brand),
    model: clean(d.model),
    name: clean(d.name),
    category: clean(d.category),
    variants: d.variants.map((v) => ({
      storage: clean(v.storage),
      color: clean(v.color),
      grade: v.grade,
      condition: v.condition,
      costPrice: v.cost_price,
      salePrice: v.sale_price,
      initialQuantity: v.initial_quantity,
    })),
    notes: d.notes.map((n) => n.trim()).filter(Boolean).slice(0, 5),
  };
}
