# ============================================
# Multi-stage Build - Production Ready
# ============================================

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./
COPY prisma ./prisma/

# Installer TOUTES les dépendances (devDeps nécessaires pour le build TypeScript)
RUN npm ci

# Copier le code source
COPY . .

# Générer le client Prisma + Build TypeScript
RUN npx prisma generate && npm run build

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

# Installer dumb-init + OpenSSL (requis par Prisma sur Alpine)
RUN apk add --no-cache dumb-init openssl

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copier les dépendances du builder avec les bonnes permissions
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma

# Copier les fichiers de config
COPY --chown=nestjs:nodejs package*.json ./

USER nestjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Utiliser dumb-init pour lancer l'app
ENTRYPOINT ["dumb-init", "--"]

# Synchroniser le schéma Prisma avec la BDD production au démarrage.
# Note : ?pgbouncer=true est incompatible avec prisma db push (advisory locks session-level).
# On retire ce paramètre uniquement pour la migration ; node dist/main.js utilise l'URL complète.
CMD ["sh", "-c", "MIGRATE_URL=$(echo \"$DATABASE_URL\" | sed 's/[?&]pgbouncer=true//g') && DATABASE_URL=\"$MIGRATE_URL\" node_modules/.bin/prisma db push --skip-generate --accept-data-loss && node dist/main.js"]

# Expose le port
EXPOSE 3001
