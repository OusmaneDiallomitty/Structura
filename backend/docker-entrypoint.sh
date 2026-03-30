#!/bin/sh
set -e

echo "🔄 Synchronisation du schéma Prisma..."
npx prisma db push --accept-data-loss

echo "🚀 Démarrage de l'application..."
exec node dist/main.js
