# 🚀 Structura Backend API

Backend NestJS pour la plateforme Structura - Système de gestion multi-tenant pour écoles, commerces et services.

## 📋 Prérequis

- Node.js 18+
- Docker Desktop
- npm ou yarn

## 🚀 Installation

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
```

### 3. Démarrer Docker (PostgreSQL + Redis)

```bash
docker-compose up -d
```

### 4. Générer le client Prisma

```bash
npm run prisma:generate
```

### 5. Créer la base de données

```bash
npm run prisma:push
```

### 6. Démarrer le serveur

```bash
npm run dev
```

Le backend sera disponible sur **http://localhost:3001/api**

## 📡 Endpoints API

### Authentification

```
POST   /api/auth/register    - Créer un compte
POST   /api/auth/login       - Se connecter
GET    /api/auth/me          - Obtenir l'utilisateur actuel (protégé)
POST   /api/auth/refresh     - Rafraîchir le token (protégé)
```

## 🧪 Tester l'API

### Avec cURL

**Register:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Amadou Diallo",
    "email": "amadou@ecole.com",
    "phone": "+224620000000",
    "password": "password123",
    "organizationName": "École Primaire Conakry",
    "organizationType": "school",
    "country": "Guinea",
    "city": "Conakry"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "amadou@ecole.com",
    "password": "password123"
  }'
```

**Get Profile (avec token):**
```bash
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 🔧 Scripts disponibles

```bash
# Développement
npm run dev              # Démarrer en mode watch
npm run start            # Démarrer en mode normal
npm run build            # Build pour production
npm run start:prod       # Démarrer en production

# Prisma
npm run prisma:generate  # Générer le client Prisma
npm run prisma:push      # Appliquer le schéma à la DB
npm run prisma:migrate   # Créer une migration
npm run prisma:studio    # Ouvrir Prisma Studio

# Docker
docker-compose up -d     # Démarrer les containers
docker-compose down      # Arrêter les containers
docker-compose logs -f   # Voir les logs
```

## 🏗️ Structure du projet

```
Backend/
├── src/
│   ├── auth/              # Module d'authentification
│   │   ├── dto/           # Data Transfer Objects
│   │   ├── guards/        # Guards JWT
│   │   ├── strategies/    # Stratégies Passport
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   │
│   ├── users/             # Module utilisateurs
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   │
│   ├── prisma/            # Module Prisma
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   │
│   ├── app.module.ts      # Module principal
│   └── main.ts            # Point d'entrée
│
├── prisma/
│   └── schema.prisma      # Schéma de base de données
│
├── docker-compose.yml     # Configuration Docker
├── .env.example           # Variables d'environnement
└── package.json
```

## 🔐 Sécurité

- Mots de passe hashés avec bcrypt (12 rounds)
- JWT tokens avec expiration
- CORS configuré pour le frontend
- Validation automatique des DTOs
- Multi-tenant avec isolation des données

## 🌍 Déploiement

### Option 1: Railway

```bash
# Installer Railway CLI
npm i -g @railway/cli

# Login
railway login

# Déployer
railway up
```

### Option 2: Render

1. Connecter le repo GitHub
2. Ajouter PostgreSQL
3. Configurer les variables d'environnement
4. Déployer

## 📚 Documentation

- [NestJS](https://docs.nestjs.com/)
- [Prisma](https://www.prisma.io/docs/)
- [PostgreSQL](https://www.postgresql.org/docs/)

## 🆘 Support

En cas de problème, vérifier :
1. Docker est démarré
2. Les variables d'environnement sont correctes
3. La base de données est créée
4. Le port 3001 est disponible
