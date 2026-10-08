import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(120),
  country: z.string().trim().length(2, "Code pays à 2 lettres (ex. FR).").toUpperCase().optional().or(z.literal("")),
  default_currency: z.string().trim().length(3).toUpperCase().default("EUR"),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(120),
  country: z.string().trim().length(2, "Code pays à 2 lettres (ex. FR).").toUpperCase().or(z.literal("")),
  default_currency: z.string().trim().length(3, "Code devise à 3 lettres (ex. EUR).").toUpperCase(),
  default_shipping_cost: z.coerce.number().min(0).optional().or(z.literal("")),
  vat_rate: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
  role: z.enum(["admin", "member", "viewer"]),
});

export const changeRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

/** Références transmises par les formulaires d'administration (identifiants et jeton d'invitation). */
export const memberRefSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  token: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
});
