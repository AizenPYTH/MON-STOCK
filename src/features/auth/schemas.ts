import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Adresse email invalide.");
export const passwordSchema = z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(128);

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Mot de passe requis."),
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  full_name: z.string().trim().min(1, "Votre nom est requis.").max(120),
  next: z.string().optional(),
});

export const resetPasswordSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Les mots de passe ne correspondent pas.", path: ["confirm"] });
