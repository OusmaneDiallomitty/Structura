#!/bin/bash

# ============================================
# Script de développement avec Docker
# ============================================

set -e

echo "🐳 Structura Backend - Docker Development"
echo "=========================================="

# Vérifier si Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé"
    exit 1
fi

# Vérifier si Docker Compose est installé
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose n'est pas installé"
    exit 1
fi

# Options
COMMAND=${1:-up}

case $COMMAND in
    up)
        echo "🚀 Démarrage des services..."
        docker-compose up -d
        echo "✅ Services démarrés"
        echo ""
        echo "📊 Status:"
        docker-compose ps
        echo ""
        echo "🔗 URLs:"
        echo "  - Backend: http://localhost:3001"
        echo "  - PostgreSQL: localhost:5432"
        echo "  - Redis: localhost:6379"
        ;;
    
    down)
        echo "🛑 Arrêt des services..."
        docker-compose down
        echo "✅ Services arrêtés"
        ;;
    
    logs)
        echo "📋 Logs des services..."
        docker-compose logs -f
        ;;
    
    logs-backend)
        echo "📋 Logs du backend..."
        docker-compose logs -f backend
        ;;
    
    logs-db)
        echo "📋 Logs de la base de données..."
        docker-compose logs -f postgres
        ;;
    
    logs-redis)
        echo "📋 Logs de Redis..."
        docker-compose logs -f redis
        ;;
    
    ps)
        echo "📊 Status des services:"
        docker-compose ps
        ;;
    
    restart)
        echo "🔄 Redémarrage des services..."
        docker-compose restart
        echo "✅ Services redémarrés"
        ;;
    
    clean)
        echo "🧹 Nettoyage des volumes..."
        docker-compose down -v
        echo "✅ Volumes supprimés"
        ;;
    
    build)
        echo "🔨 Build des images..."
        docker-compose build
        echo "✅ Images construites"
        ;;
    
    shell-db)
        echo "🐘 Connexion à PostgreSQL..."
        docker-compose exec postgres psql -U structura_admin -d structura_dev
        ;;
    
    shell-redis)
        echo "🔴 Connexion à Redis..."
        docker-compose exec redis redis-cli
        ;;
    
    migrate)
        echo "🔄 Exécution des migrations Prisma..."
        docker-compose exec backend npx prisma migrate deploy
        echo "✅ Migrations exécutées"
        ;;
    
    seed)
        echo "🌱 Seed de la base de données..."
        docker-compose exec backend npx prisma db seed
        echo "✅ Base de données seedée"
        ;;
    
    *)
        echo "❌ Commande inconnue: $COMMAND"
        echo ""
        echo "Commandes disponibles:"
        echo "  up              - Démarrer les services"
        echo "  down            - Arrêter les services"
        echo "  logs            - Afficher les logs"
        echo "  logs-backend    - Logs du backend"
        echo "  logs-db         - Logs de la DB"
        echo "  logs-redis      - Logs de Redis"
        echo "  ps              - Status des services"
        echo "  restart         - Redémarrer les services"
        echo "  clean           - Nettoyer les volumes"
        echo "  build           - Build les images"
        echo "  shell-db        - Shell PostgreSQL"
        echo "  shell-redis     - Shell Redis"
        echo "  migrate         - Exécuter les migrations"
        echo "  seed            - Seed la base de données"
        exit 1
        ;;
esac
