// Configuration centralisée pour Structura
import { z } from 'zod';

// Schema de validation pour les variables d'environnement
const envSchema = z.object({
  // Base de données
  DATABASE_URL: z.string().url('DATABASE_URL doit être une URL valide'),
  
  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit contenir au moins 32 caractères'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET doit contenir au moins 32 caractères'),
  
  // Redis (optionnel)
  REDIS_URL: z.string().url().optional(),
  
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Structura'),
  NEXT_PUBLIC_API_URL: z.string().default('/api'),
  
  // Frontend URL (pour CORS)
  FRONTEND_URL: z.string().url().optional(),
  
  // Email (optionnel pour plus tard)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  
  // Upload/Storage (optionnel)
  UPLOAD_MAX_SIZE: z.string().default('5MB'),
  ALLOWED_FILE_TYPES: z.string().default('image/jpeg,image/png,image/webp,application/pdf'),
});

// Fonction pour valider et obtenir la configuration
function getConfig() {
  try {
    return envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
      REDIS_URL: process.env.REDIS_URL,
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      FRONTEND_URL: process.env.FRONTEND_URL,
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      UPLOAD_MAX_SIZE: process.env.UPLOAD_MAX_SIZE,
      ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Configuration invalide:');
      error.issues.forEach((err: z.ZodIssue) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

// Configuration exportée
export const config = getConfig();

// Utilitaires de configuration
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

// Configuration de l'upload
export const uploadConfig = {
  maxSize: parseSize(config.UPLOAD_MAX_SIZE),
  allowedTypes: config.ALLOWED_FILE_TYPES.split(',').map(type => type.trim()),
};

// Configuration JWT
export const jwtConfig = {
  secret: config.JWT_SECRET,
  refreshSecret: config.JWT_REFRESH_SECRET,
  accessTokenExpiry: '7d',
  refreshTokenExpiry: '30d',
};

// Configuration de la base de données
export const dbConfig = {
  url: config.DATABASE_URL,
  logLevel: isDevelopment ? ['query', 'error', 'warn'] : ['error'],
};

// Configuration Redis
export const redisConfig = {
  url: config.REDIS_URL,
  enabled: !!config.REDIS_URL,
};

// Configuration CORS
export const corsConfig = {
  origin: config.FRONTEND_URL || (isDevelopment ? 'http://localhost:3000' : false),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Configuration de sécurité
export const securityConfig = {
  bcryptRounds: 12,
  rateLimitWindow: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 100, // 100 requêtes par fenêtre
  authRateLimitMax: 20, // 20 requêtes auth par fenêtre
  sessionTimeout: 7 * 24 * 60 * 60 * 1000, // 7 jours
};

// Fonction utilitaire pour parser les tailles
function parseSize(sizeStr: string): number {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
  if (!match) {
    throw new Error(`Format de taille invalide: ${sizeStr}`);
  }

  const [, size, unit] = match;
  return parseFloat(size) * units[unit.toUpperCase()];
}

// Validation de la configuration au démarrage
export function validateConfig() {
  console.log('🔧 Validation de la configuration...');
  
  // Vérifications critiques
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL est requis');
  }
  
  if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET doit contenir au moins 32 caractères');
  }
  
  if (!config.JWT_REFRESH_SECRET || config.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET doit contenir au moins 32 caractères');
  }

  // Avertissements
  if (isProduction) {
    if (config.JWT_SECRET.includes('dev') || config.JWT_SECRET.includes('test')) {
      console.warn('⚠️  JWT_SECRET semble être un secret de développement en production');
    }
    
    if (!config.FRONTEND_URL) {
      console.warn('⚠️  FRONTEND_URL n\'est pas défini en production');
    }
  }

  console.log('✅ Configuration validée');
  console.log(`📊 Environnement: ${config.NODE_ENV}`);
  console.log(`🏢 Application: ${config.NEXT_PUBLIC_APP_NAME}`);
  console.log(`🔗 API URL: ${config.NEXT_PUBLIC_API_URL}`);
  
  if (redisConfig.enabled) {
    console.log('🔴 Redis: Activé');
  } else {
    console.log('🔴 Redis: Désactivé');
  }
}

// Exporter les types pour TypeScript
export type Config = z.infer<typeof envSchema>;