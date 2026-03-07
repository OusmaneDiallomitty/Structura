#!/bin/bash
# =============================================================================
# deploy.sh — Structura Production Deployment
# =============================================================================
#
# Usage (première fois) :
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# Usage (mise à jour) :
#   git pull && ./scripts/deploy.sh
#
# Ce script :
#   1. Vérifie les prérequis (Node, PM2, Nginx, Docker)
#   2. Installe les dépendances
#   3. Build backend + frontend + admin
#   4. Applique les migrations Prisma
#   5. Redémarre les processus PM2 sans downtime
#   6. Recharge Nginx
#   7. Vérifie que tout est OK
# =============================================================================

set -e  # Arrêter le script si une commande échoue

# ── Couleurs terminal ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_success() { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Variables ─────────────────────────────────────────────────────────────────
DEPLOY_START=$(date +%s)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs"

echo ""
echo "=============================================="
echo "  Structura — Déploiement Production"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="
echo ""

# =============================================================================
# ÉTAPE 1 — Vérification des prérequis
# =============================================================================
log_info "Vérification des prérequis..."

command -v node  >/dev/null 2>&1 || log_error "Node.js non installé"
command -v npm   >/dev/null 2>&1 || log_error "npm non installé"
command -v pm2   >/dev/null 2>&1 || log_error "PM2 non installé (npm install -g pm2)"
command -v nginx >/dev/null 2>&1 || log_error "Nginx non installé"
command -v docker>/dev/null 2>&1 || log_warn  "Docker non installé — PostgreSQL doit être externe"

NODE_VERSION=$(node -v)
log_success "Node.js $NODE_VERSION"

# Vérifier que les fichiers .env existent
[ -f "$PROJECT_ROOT/backend/.env" ]       || log_error "backend/.env manquant"
[ -f "$PROJECT_ROOT/Front-end/.env.local" ] || log_error "Front-end/.env.local manquant"

# Vérifier les variables critiques backend
source "$PROJECT_ROOT/backend/.env"
[ -z "$DATABASE_URL" ] && log_error "DATABASE_URL non défini dans backend/.env"
[ -z "$JWT_SECRET"   ] && log_error "JWT_SECRET non défini dans backend/.env"
[ -z "$REDIS_URL"    ] && log_error "REDIS_URL non défini dans backend/.env"

log_success "Variables d'environnement OK"

# =============================================================================
# ÉTAPE 2 — Créer le dossier logs
# =============================================================================
mkdir -p "$LOGS_DIR"
log_success "Dossier logs créé"

# =============================================================================
# ÉTAPE 3 — Docker (PostgreSQL + Redis)
# =============================================================================
if command -v docker &>/dev/null; then
  log_info "Démarrage PostgreSQL + Redis (Docker)..."
  cd "$PROJECT_ROOT/backend"
  docker compose up -d --quiet-pull
  sleep 3
  log_success "Docker containers démarrés"
fi

# =============================================================================
# ÉTAPE 4 — Installation des dépendances
# =============================================================================
log_info "Installation dépendances backend..."
cd "$PROJECT_ROOT/backend"
npm ci --omit=dev 2>&1 | tail -3
log_success "Dépendances backend OK"

log_info "Installation dépendances frontend..."
cd "$PROJECT_ROOT/Front-end"
npm ci --omit=dev 2>&1 | tail -3
log_success "Dépendances frontend OK"

log_info "Installation dépendances admin..."
cd "$PROJECT_ROOT/admin"
npm ci --omit=dev 2>&1 | tail -3
log_success "Dépendances admin OK"

# =============================================================================
# ÉTAPE 5 — Migrations Prisma
# =============================================================================
log_info "Application des migrations Prisma..."
cd "$PROJECT_ROOT/backend"
npx prisma migrate deploy 2>&1 | tail -5
npx prisma generate
log_success "Migrations Prisma OK"

# =============================================================================
# ÉTAPE 6 — Build des applications
# =============================================================================
log_info "Build backend NestJS..."
cd "$PROJECT_ROOT/backend"
npm run build 2>&1 | tail -3
log_success "Build backend OK"

log_info "Build frontend Next.js..."
cd "$PROJECT_ROOT/Front-end"
npm run build 2>&1 | tail -5
log_success "Build frontend OK"

log_info "Build admin Next.js..."
cd "$PROJECT_ROOT/admin"
npm run build 2>&1 | tail -5
log_success "Build admin OK"

# =============================================================================
# ÉTAPE 7 — Démarrage / Redémarrage PM2
# =============================================================================
log_info "Démarrage des processus PM2..."
cd "$PROJECT_ROOT"

# Si les processus existent déjà → reload gracieux (0-downtime)
# Si non → démarrage initial
if pm2 list | grep -q "structura-backend"; then
  pm2 reload ecosystem.config.js --env production 2>&1 | tail -3
  log_success "PM2 rechargé (0-downtime)"
else
  pm2 start backend/ecosystem.config.js --env production 2>&1 | tail -5
  pm2 save
  log_success "PM2 démarré et sauvegardé"
fi

# =============================================================================
# ÉTAPE 8 — Vérification Nginx et rechargement
# =============================================================================
log_info "Test de la configuration Nginx..."
sudo nginx -t 2>&1 && log_success "Configuration Nginx valide" || log_error "Erreur configuration Nginx"

log_info "Rechargement Nginx..."
sudo systemctl reload nginx
log_success "Nginx rechargé"

# =============================================================================
# ÉTAPE 9 — Vérifications finales
# =============================================================================
log_info "Vérifications finales..."
sleep 5  # Attendre que les processus démarrent

# Vérifier que les 3 processus PM2 sont actifs
BACKEND_STATUS=$(pm2 jlist | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const p=d.find(x=>x.name==='structura-backend'); process.stdout.write(p?p.pm2_env.status:'absent')" 2>/dev/null || echo "error")
FRONTEND_STATUS=$(pm2 jlist | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const p=d.find(x=>x.name==='structura-frontend'); process.stdout.write(p?p.pm2_env.status:'absent')" 2>/dev/null || echo "error")
ADMIN_STATUS=$(pm2 jlist | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const p=d.find(x=>x.name==='structura-admin'); process.stdout.write(p?p.pm2_env.status:'absent')" 2>/dev/null || echo "error")

[ "$BACKEND_STATUS"  = "online" ] && log_success "Backend  → online" || log_warn "Backend  → $BACKEND_STATUS"
[ "$FRONTEND_STATUS" = "online" ] && log_success "Frontend → online" || log_warn "Frontend → $FRONTEND_STATUS"
[ "$ADMIN_STATUS"    = "online" ] && log_success "Admin    → online" || log_warn "Admin    → $ADMIN_STATUS"

# Health check API
sleep 2
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  log_success "Health check API → 200 OK"
else
  log_warn "Health check API → $HTTP_STATUS (le backend prend peut-être plus de temps)"
fi

# =============================================================================
# RÉSUMÉ
# =============================================================================
DEPLOY_END=$(date +%s)
DURATION=$((DEPLOY_END - DEPLOY_START))

echo ""
echo "=============================================="
echo -e "${GREEN}  Déploiement terminé en ${DURATION}s${NC}"
echo "=============================================="
echo ""
echo "  Commandes utiles :"
echo "  pm2 status          # État des processus"
echo "  pm2 logs            # Logs temps réel"
echo "  pm2 monit           # Dashboard CPU/RAM"
echo ""
