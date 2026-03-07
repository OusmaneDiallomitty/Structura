import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Rate limiting store (en production, utiliser Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limiting middleware
export function rateLimit(maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) {
  return (request: NextRequest) => {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Nettoyer les anciennes entrées
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }

    const current = rateLimitStore.get(ip);

    if (!current) {
      rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
      return null; // Pas de limite atteinte
    }

    if (current.resetTime < now) {
      // Fenêtre expirée, reset
      rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
      return null;
    }

    if (current.count >= maxRequests) {
      return NextResponse.json(
        { 
          message: 'Trop de requêtes. Veuillez réessayer plus tard.',
          retryAfter: Math.ceil((current.resetTime - now) / 1000)
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil((current.resetTime - now) / 1000).toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': current.resetTime.toString(),
          }
        }
      );
    }

    // Incrémenter le compteur
    current.count++;
    return null; // Pas de limite atteinte
  };
}

// Wrapper pour gérer les erreurs de façon uniforme
export function withErrorHandling(handler: Function) {
  return async (request: NextRequest, context?: any) => {
    try {
      return await handler(request, context);
    } catch (error) {
      console.error('API Error:', error);

      // Erreur de validation Zod
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            message: 'Données invalides',
            errors: error.issues.map((err: z.ZodIssue) => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          },
          { status: 400 }
        );
      }

      // Erreur d'authentification
      if (error instanceof Error && error.message === 'Unauthorized') {
        return NextResponse.json(
          { message: 'Non autorisé' },
          { status: 401 }
        );
      }

      // Erreur Prisma
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { message: 'Cette ressource existe déjà' },
          { status: 409 }
        );
      }

      // Erreur générique
      return NextResponse.json(
        { message: 'Erreur interne du serveur' },
        { status: 500 }
      );
    }
  };
}

// Middleware de sécurité
export function withSecurity(handler: Function) {
  return async (request: NextRequest, context?: any) => {
    // Headers de sécurité
    const response = await handler(request, context);
    
    if (response instanceof NextResponse) {
      // CORS headers
      response.headers.set('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      response.headers.set('Access-Control-Allow-Credentials', 'true');

      // Security headers
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('X-XSS-Protection', '1; mode=block');
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      if (process.env.NODE_ENV === 'production') {
        response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
    }

    return response;
  };
}

// Middleware de logging
export function withLogging(handler: Function) {
  return async (request: NextRequest, context?: any) => {
    const start = Date.now();
    const method = request.method;
    const url = request.url;
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    console.log(`[${new Date().toISOString()}] ${method} ${url} - ${ip} - ${userAgent}`);

    try {
      const response = await handler(request, context);
      const duration = Date.now() - start;
      const status = response instanceof NextResponse ? response.status : 200;
      
      console.log(`[${new Date().toISOString()}] ${method} ${url} - ${status} - ${duration}ms`);
      
      return response;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`[${new Date().toISOString()}] ${method} ${url} - ERROR - ${duration}ms:`, error);
      throw error;
    }
  };
}

// Composer plusieurs middlewares
export function compose(...middlewares: Function[]) {
  return (handler: Function) => {
    return middlewares.reduceRight((acc, middleware) => middleware(acc), handler);
  };
}

// Middleware complet pour les API routes
export const withApiMiddleware = compose(
  withLogging,
  withSecurity,
  withErrorHandling
);

// Middleware avec rate limiting pour les endpoints sensibles
export const withAuthApiMiddleware = compose(
  withLogging,
  withSecurity,
  (handler: Function) => (request: NextRequest, context?: any) => {
    const rateLimitResponse = rateLimit(20, 15 * 60 * 1000)(request); // 20 req/15min
    if (rateLimitResponse) return rateLimitResponse;
    return handler(request, context);
  },
  withErrorHandling
);