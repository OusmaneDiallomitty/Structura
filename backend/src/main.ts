// CRITICAL: Importer bootstrap EN PREMIER pour charger .env
import './bootstrap';

// CRITICAL: Sentry doit être initialisé avant tout autre import applicatif
import * as Sentry from '@sentry/node';
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION ?? 'structura@1.0.0',
    // 10% des transactions tracées en production, 100% en dev (0 = désactivé)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    // Ignorer les erreurs client bénignes
    ignoreErrors: ['UnauthorizedException', 'NotFoundException', 'ForbiddenException'],
  });
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // rawBody: true — nécessaire pour vérifier la signature HMAC des webhooks Djomy
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Activer trust proxy pour récupérer l'IP réelle derrière Nginx/Caddy/load balancer
  // Indispensable pour que le rate limiting fonctionne correctement en production
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Compression gzip des réponses HTTP
  app.use(compression());

  // Sécurité HTTP (headers)
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
      // Protège contre le clickjacking
      frameguard: { action: 'deny' },
      // Empêche le sniffing MIME
      noSniff: true,
      // Force HTTPS en production
      hsts: process.env.NODE_ENV === 'production'
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    }),
  );

  // CORS - Autoriser le frontend et le panneau admin
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.ADMIN_URL,
    // En dev : autoriser aussi le tunnel HTTPS frontend (ngrok/localhost.run)
    process.env.APP_PUBLIC_URL,
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global prefix pour toutes les routes
  app.setGlobalPrefix('api');

  // Filtres d'exceptions globaux (ordre : AllExceptions en dernier recours, Http en priorité)
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

  // Validation automatique des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Supprime les propriétés non définies dans le DTO
      forbidNonWhitelisted: true, // Rejette les requêtes avec des propriétés non autorisées
      transform: true, // Transforme automatiquement les types
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port);

  logger.log(`✅ Structura API démarré — port ${port} (${process.env.NODE_ENV || 'development'})`);
}

bootstrap();
