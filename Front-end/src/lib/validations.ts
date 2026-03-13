// Schémas de validation avec Zod
import { z } from "zod";
import { ERROR_MESSAGES } from "./constants";

// Schéma de validation pour le login
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, ERROR_MESSAGES.REQUIRED_FIELD)
    .email(ERROR_MESSAGES.INVALID_EMAIL),
  password: z
    .string()
    .min(1, ERROR_MESSAGES.REQUIRED_FIELD)
    .min(8, ERROR_MESSAGES.INVALID_PASSWORD),
  rememberMe: z.boolean().optional(),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// Schéma de validation pour l'inscription
export const registerSchema = z
  .object({
    // Informations personnelles
    fullName: z
      .string()
      .min(1, ERROR_MESSAGES.REQUIRED_FIELD)
      .min(3, "Le nom doit contenir au moins 3 caractères")
      .max(100, "Le nom est trop long")
      .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, "Le nom contient des caractères invalides"),
    email: z
      .string()
      .min(1, ERROR_MESSAGES.REQUIRED_FIELD)
      .email(ERROR_MESSAGES.INVALID_EMAIL)
      .toLowerCase(),
    phone: z
      .string()
      .min(1, ERROR_MESSAGES.REQUIRED_FIELD)
      .regex(
        /^\+224\d{9}$/,
        "Numéro invalide — 9 chiffres requis après +224 (ex : 620 000 000)"
      ),
    password: z
      .string()
      .min(1, ERROR_MESSAGES.REQUIRED_FIELD)
      .min(8, "Le mot de passe doit contenir au moins 8 caractères")
      .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
      .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
      .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre")
      .regex(
        /[^A-Za-z0-9]/,
        "Le mot de passe doit contenir au moins un caractère spécial"
      ),
    confirmPassword: z
      .string()
      .min(1, "Veuillez confirmer votre mot de passe"),

    // Informations de l'organisation
    organizationName: z
      .string()
      .min(1, ERROR_MESSAGES.REQUIRED_FIELD)
      .min(3, "Le nom doit contenir au moins 3 caractères")
      .max(100, "Le nom est trop long"),
    organizationType: z.enum(["school", "business", "service"]).refine((val) => val, {
      message: "Veuillez sélectionner un type d'organisation",
    }),
    country: z.string().min(1, ERROR_MESSAGES.REQUIRED_FIELD),
    city: z.string().min(1, ERROR_MESSAGES.REQUIRED_FIELD),

    // Acceptation légale
    acceptTerms: z.boolean().refine((val) => val === true, {
      message: "Vous devez accepter les conditions d'utilisation",
    }),
    acceptPrivacy: z.boolean().refine((val) => val === true, {
      message: "Vous devez accepter la politique de confidentialité",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;
