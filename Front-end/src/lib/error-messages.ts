/**
 * Messages d'erreur user-friendly
 * Convertit les erreurs techniques en messages compréhensibles
 */

export interface ErrorMapping {
  pattern: RegExp | string;
  message: string;
}

/**
 * Mappings d'erreurs communes
 */
const ERROR_MAPPINGS: ErrorMapping[] = [
  // Erreurs réseau
  {
    pattern: /network|fetch|connection/i,
    message: "Impossible de se connecter au serveur. Vérifiez votre connexion internet.",
  },
  {
    pattern: /timeout/i,
    message: "Le serveur met trop de temps à répondre. Veuillez réessayer.",
  },

  // Erreurs d'authentification
  {
    pattern: /email.*already.*exist|email.*taken|duplicate.*email/i,
    message: "Cet email est déjà utilisé. Essayez de vous connecter ou utilisez un autre email.",
  },
  {
    pattern: /invalid.*credentials|incorrect.*password|wrong.*password/i,
    message: "Email ou mot de passe incorrect. Veuillez vérifier vos identifiants.",
  },
  {
    pattern: /password.*weak|password.*requirements/i,
    message: "Le mot de passe ne respecte pas les critères de sécurité requis.",
  },
  {
    pattern: /email.*invalid|invalid.*email/i,
    message: "L'adresse email n'est pas valide. Veuillez vérifier le format.",
  },

  // Erreurs de validation
  {
    pattern: /required|missing.*field/i,
    message: "Tous les champs obligatoires doivent être remplis.",
  },
  {
    pattern: /validation.*failed/i,
    message: "Les informations fournies ne sont pas valides. Veuillez vérifier vos données.",
  },

  // Erreurs serveur
  {
    pattern: /internal.*server.*error|500/i,
    message: "Une erreur s'est produite sur nos serveurs. Notre équipe a été notifiée. Veuillez réessayer dans quelques instants.",
  },
  {
    pattern: /service.*unavailable|503/i,
    message: "Le service est temporairement indisponible. Veuillez réessayer dans quelques minutes.",
  },
  {
    pattern: /database|prisma/i,
    message: "Un problème technique est survenu. Veuillez réessayer dans quelques instants.",
  },

  // Erreurs d'autorisation
  {
    pattern: /unauthorized|401/i,
    message: "Vous devez être connecté pour effectuer cette action.",
  },
  {
    pattern: /forbidden|403/i,
    message: "Vous n'avez pas l'autorisation d'effectuer cette action.",
  },
  {
    pattern: /not.*found|404/i,
    message: "La ressource demandée n'a pas été trouvée.",
  },

  // Erreurs de rate limiting
  {
    pattern: /too.*many.*requests|rate.*limit/i,
    message: "Trop de tentatives. Veuillez patienter quelques minutes avant de réessayer.",
  },
];

/**
 * Message d'erreur par défaut
 */
const DEFAULT_ERROR_MESSAGE =
  "Une erreur inattendue s'est produite. Veuillez réessayer ou contacter le support si le problème persiste.";

/**
 * Convertit une erreur technique en message user-friendly
 * @param error - L'erreur à convertir (Error, string, ou object)
 * @returns Message user-friendly
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  // Si c'est null ou undefined
  if (!error) {
    return DEFAULT_ERROR_MESSAGE;
  }

  // Extraire le message d'erreur
  let errorMessage = "";

  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === "string") {
    errorMessage = error;
  } else if (typeof error === "object" && "message" in error) {
    errorMessage = String(error.message);
  } else {
    return DEFAULT_ERROR_MESSAGE;
  }

  // Vérifier si le message correspond à un pattern connu
  for (const mapping of ERROR_MAPPINGS) {
    if (typeof mapping.pattern === "string") {
      if (errorMessage.toLowerCase().includes(mapping.pattern.toLowerCase())) {
        return mapping.message;
      }
    } else {
      if (mapping.pattern.test(errorMessage)) {
        return mapping.message;
      }
    }
  }

  // Si aucun pattern ne correspond, retourner le message par défaut
  // SAUF si le message original est déjà user-friendly (pas de mots techniques)
  const technicalWords = [
    "error",
    "exception",
    "stack",
    "undefined",
    "null",
    "prisma",
    "nest",
    "http",
    "api",
    "internal",
    "server",
  ];

  const isTechnical = technicalWords.some((word) =>
    errorMessage.toLowerCase().includes(word)
  );

  if (isTechnical) {
    return DEFAULT_ERROR_MESSAGE;
  }

  // Le message semble déjà user-friendly
  return errorMessage;
}

/**
 * Extrait les détails d'une erreur API pour logging
 * @param error - L'erreur à analyser
 * @returns Objet avec les détails de l'erreur
 */
export function getErrorDetails(error: unknown): {
  message: string;
  code?: string;
  status?: number;
} {
  // Stack jamais incluse : évite les fuites d'info en cas de log accidentel
  if (error instanceof Error) {
    return {
      message: error.message,
      code: (error as any).code,
      status: (error as any).status || (error as any).statusCode,
    };
  }

  if (typeof error === "object" && error !== null) {
    return {
      message: (error as any).message || "Erreur inconnue",
      code: (error as any).code,
      status: (error as any).status || (error as any).statusCode,
    };
  }

  return {
    message: "Erreur inconnue",
  };
}
