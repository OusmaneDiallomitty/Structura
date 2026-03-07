@echo off
REM ============================================
REM Script de développement avec Docker (Windows)
REM ============================================

setlocal enabledelayedexpansion

echo.
echo 🐳 Structura Backend - Docker Development
echo ==========================================
echo.

REM Vérifier si Docker est installé
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker n'est pas installé
    exit /b 1
)

REM Vérifier si Docker Compose est installé
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker Compose n'est pas installé
    exit /b 1
)

REM Options
set COMMAND=%1
if "%COMMAND%"=="" set COMMAND=up

if "%COMMAND%"=="up" (
    echo 🚀 Démarrage des services...
    docker-compose up -d
    echo ✅ Services démarrés
    echo.
    echo 📊 Status:
    docker-compose ps
    echo.
    echo 🔗 URLs:
    echo   - Backend: http://localhost:3001
    echo   - PostgreSQL: localhost:5432
    echo   - Redis: localhost:6379
    goto end
)

if "%COMMAND%"=="down" (
    echo 🛑 Arrêt des services...
    docker-compose down
    echo ✅ Services arrêtés
    goto end
)

if "%COMMAND%"=="logs" (
    echo 📋 Logs des services...
    docker-compose logs -f
    goto end
)

if "%COMMAND%"=="logs-backend" (
    echo 📋 Logs du backend...
    docker-compose logs -f backend
    goto end
)

if "%COMMAND%"=="logs-db" (
    echo 📋 Logs de la base de données...
    docker-compose logs -f postgres
    goto end
)

if "%COMMAND%"=="logs-redis" (
    echo 📋 Logs de Redis...
    docker-compose logs -f redis
    goto end
)

if "%COMMAND%"=="ps" (
    echo 📊 Status des services:
    docker-compose ps
    goto end
)

if "%COMMAND%"=="restart" (
    echo 🔄 Redémarrage des services...
    docker-compose restart
    echo ✅ Services redémarrés
    goto end
)

if "%COMMAND%"=="clean" (
    echo 🧹 Nettoyage des volumes...
    docker-compose down -v
    echo ✅ Volumes supprimés
    goto end
)

if "%COMMAND%"=="build" (
    echo 🔨 Build des images...
    docker-compose build
    echo ✅ Images construites
    goto end
)

if "%COMMAND%"=="shell-db" (
    echo 🐘 Connexion à PostgreSQL...
    docker-compose exec postgres psql -U structura_admin -d structura_dev
    goto end
)

if "%COMMAND%"=="shell-redis" (
    echo 🔴 Connexion à Redis...
    docker-compose exec redis redis-cli
    goto end
)

if "%COMMAND%"=="migrate" (
    echo 🔄 Exécution des migrations Prisma...
    docker-compose exec backend npx prisma migrate deploy
    echo ✅ Migrations exécutées
    goto end
)

if "%COMMAND%"=="seed" (
    echo 🌱 Seed de la base de données...
    docker-compose exec backend npx prisma db seed
    echo ✅ Base de données seedée
    goto end
)

echo ❌ Commande inconnue: %COMMAND%
echo.
echo Commandes disponibles:
echo   up              - Démarrer les services
echo   down            - Arrêter les services
echo   logs            - Afficher les logs
echo   logs-backend    - Logs du backend
echo   logs-db         - Logs de la DB
echo   logs-redis      - Logs de Redis
echo   ps              - Status des services
echo   restart         - Redémarrer les services
echo   clean           - Nettoyer les volumes
echo   build           - Build les images
echo   shell-db        - Shell PostgreSQL
echo   shell-redis     - Shell Redis
echo   migrate         - Exécuter les migrations
echo   seed            - Seed la base de données
exit /b 1

:end
echo.
