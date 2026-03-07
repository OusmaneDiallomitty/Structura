# CLAUDE.md - Structura

> Guide de développement pour Structura - Plateforme SaaS multi-tenant de gestion scolaire

**Version** : 1.0.0 | **Dernière MAJ** : 09/02/2026 | **Statut** : 🔄 Refactoring 50%

---

## 🎯 Vue d'ensemble

**Structura** : Plateforme SaaS multi-tenant pour gestion d'écoles avec backend NestJS et frontend Next.js séparés.

**Fonctionnalités** : Auth JWT • Multi-tenant RBAC • Élèves/Classes CRUD • Présences • Paiements • Notes • Mode Offline • Dashboard temps réel

**Objectifs** : Séparation frontend/backend • Isolation multi-tenant • Mode offline • Sécurité JWT/RBAC • Performance Redis/IndexedDB

---

## 🏗️ Architecture

**Flux** : Frontend (Next.js:3000) → Services API (lib/api/*.service.ts) → Cache (IndexedDB) → HTTP/REST+JWT → Backend (NestJS:3001) → Guards/Interceptors → Services → Prisma → PostgreSQL+Redis (Docker)

**Principes** :
1. Séparation frontend/backend via API REST uniquement
2. Multi-tenant avec tenantId obligatoire (isolation BDD)
3. Online-First : API → Cache local → Offline
4. Sécurité : Validation double + JWT + RBAC
5. Cache intelligent : Redis (backend) + IndexedDB (frontend)

---

## 💻 Stack Technique

### Backend (NestJS)
- **Core** : NestJS 10.4.22 • Node 18+ • TypeScript 5.3.3
- **Data** : PostgreSQL 16 • Prisma 5.8.0 • Redis 7
- **Auth** : Passport + JWT 10.2.0 • class-validator 0.14.0
- **Email** : Resend 6.9.1 • Docker Compose

### Frontend (Next.js)
- **Core** : Next.js 16.1.4 • React 19.2.3 • TypeScript 5.9.3
- **UI** : Tailwind 4.1.18 • shadcn/ui • Framer Motion 12.29.0
- **Forms** : React Hook Form 7.71.1 • Zod 4.3.5
- **Utils** : Recharts 3.7.0 • jsPDF 4.0.0 • IndexedDB • date-fns 4.1.0 • Sonner 2.0.7

---

## 📁 Structure du Projet

```
Structura/
├── backend/                      # NestJS Port 3001
│   ├── src/
│   │   ├── auth/                 # Auth JWT + Guards
│   │   ├── users/students/classes/attendance/payments/grades/
│   │   ├── email/                # Service Resend
│   │   ├── common/               # Decorators/Guards/Interceptors
│   │   ├── prisma/               # Prisma Service
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── prisma/schema.prisma      # 8 modèles
│   ├── docker-compose.yml        # PostgreSQL + Redis
│   └── .env
│
├── Front-end/                    # Next.js Port 3000
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/           # login/register
│   │   │   └── dashboard/        # students/classes/attendance/payments/grades
│   │   ├── components/           # UI composants
│   │   ├── contexts/AuthContext.tsx
│   │   ├── hooks/use-online.ts
│   │   ├── lib/
│   │   │   ├── api/              # ✅ Services API (6 fichiers)
│   │   │   ├── offline/          # IndexedDB + sync-queue
│   │   │   ├── storage.ts
│   │   │   └── pdf-generator.ts
│   │   └── types/
│   └── .env.local
│
└── CLAUDE.md / ARCHITECTURE.md / REFACTORING_STATUS.md
```

---

## 📐 Conventions de Code

### Naming
**Backend** : `kebab-case.ts` • `PascalCase` classes • `camelCase` méthodes • `UPPER_SNAKE_CASE` constantes • DTOs avec suffixe `Dto`

**Frontend** : `PascalCase.tsx` composants • `page.tsx` pages • `use*` hooks • `*Context` contexts • `*.service.ts` services • `PascalCase` types

### Patterns Backend
```typescript
@Controller('students')
@UseGuards(JwtAuthGuard)
export class StudentsController {
  @Get()
  async findAll(@CurrentUser() user: any) {
    return this.studentsService.findAll(user.tenantId);
  }
}
```

### Patterns Frontend
```typescript
// Service API
export async function getStudents(token: string, filters?: StudentFilters) {
  const response = await fetch(`${API_BASE_URL}/students`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error((await response.json()).message);
  return response.json();
}

// Gestion erreurs avec fallback
try {
  const data = await getStudents(token);
  setStudents(data);
} catch (error) {
  const cached = await offlineDB.getAll(STORES.STUDENTS);
  if (cached.length) {
    setStudents(cached);
    toast.info('Données chargées depuis le cache');
  }
}
```

---

## 🔄 Workflow de Développement

### Démarrage
```bash
# Terminal 1 - Backend
cd backend
docker-compose up -d && docker ps
npm install && npm run prisma:generate && npm run prisma:push
npm run dev  # ✅ http://localhost:3001/api

# Terminal 2 - Frontend
cd Front-end
npm install && npm run dev  # ✅ http://localhost:3000
```

### Développer une Feature
1. **Backend** : `nest g module absences` → Schéma Prisma → DTOs → Service/Controller → app.module.ts
2. **Frontend** : Service API → Page → Composants UI
3. **Avant commit** : `npm run build` (backend + frontend)
4. **Git** : Branche feature → Commit → Push → PR

---

## 🎯 Commandes Importantes

### Backend
```bash
npm run dev|build|start:prod
npm run prisma:generate|push|migrate|studio
docker-compose up -d|down|logs -f
npm run test|test:e2e|test:cov
```

### Frontend
```bash
npm run dev|build|start|lint
```

---

## 📊 État Actuel (50% complété)

### ✅ Terminé
- Phase 1 : Sécurité (clé API retirée - ⚠️ **À révoquer**)
- Phase 2 : 6 services API créés (students/classes/attendance/payments/grades/dashboard)
- Phase 3 : Backend frontend supprimé (dossier api/)
- Phase 4 : Dépendances nettoyées (24 packages)
- Phase 5 : AuthContext vérifié
- Phase 6 : Page students migrée (14% migration)

### 🔄 À Faire (~7h)
| Phase | Tâche | Temps | Priorité |
|-------|-------|-------|----------|
| 6.1-6.6 | Migrer 6 pages restantes | 3h30 | 🔴 Haute |
| 7 | Swagger + TS strict + ENV validation | 1h30 | 🟡 Moyenne |
| 8 | Tests complets | 1h | 🟡 Moyenne |
| 9 | Documentation | 1h | 🟢 Basse |

---

## 🔄 Pattern de Migration (CRITIQUE)

### Online-First avec Fallback

**Structure** :
```typescript
// 1. Imports
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { getStudents, deleteStudent } from "@/lib/api/students.service";
import { offlineDB, STORES } from "@/lib/offline/db";
import { useOnline } from "@/hooks/use-online";

// 2. State
const { user } = useAuth();
const isOnline = useOnline();
const [data, setData] = useState([]);

// 3. Load (Online-First)
const loadData = useCallback(async () => {
  try {
    const token = storage.getItem('structura_token');
    if (isOnline && token) {
      // API backend
      const response = await getStudents(token);
      const mapped = response.map(s => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }));
      await offlineDB.bulkAdd(STORES.STUDENTS, mapped);
      setData(mapped);
    } else {
      // Cache offline
      const cached = await offlineDB.getAll(STORES.STUDENTS);
      setData(cached);
      if (cached.length) toast.info('Mode hors ligne');
    }
  } catch (error) {
    // Fallback cache
    const cached = await offlineDB.getAll(STORES.STUDENTS);
    if (cached.length) setData(cached);
  }
}, [isOnline]);

// 4. Delete
const handleDelete = async (id: string) => {
  const token = storage.getItem('structura_token');
  if (isOnline && token) {
    await deleteStudent(token, id);
    await offlineDB.delete(STORES.STUDENTS, id);
  } else {
    await offlineDB.delete(STORES.STUDENTS, id);
    await syncQueue.add({ action: 'delete', entity: 'students', data: { id } });
  }
  await loadData();
};
```

### Checklist Migration
- [ ] Importer service API (`lib/api/*.service.ts`)
- [ ] Importer `useAuth`, `storage`, `useOnline`, `offlineDB`
- [ ] `load*()` online-first
- [ ] `delete*()/update*()` avec API
- [ ] Erreurs avec fallback cache
- [ ] Tester online + offline
- [ ] DevTools Network : requêtes vers `localhost:3001/api/*`

---

## 📋 Tâches Prioritaires

### 🔴 Urgentes

**1. Sécurité (5 min)** : Révoquer clé `re_jirc1FLn_GTe8r1BWJEwD7BcrarjLJGPk` sur https://resend.com/api-keys → Nouvelle clé dans `backend/.env`

**2. Migrer students/add (30 min)** : `Front-end/src/app/dashboard/students/add/page.tsx`
```typescript
import { createStudent } from '@/lib/api/students.service';
const handleSubmit = async (data) => {
  const token = storage.getItem('structura_token');
  await createStudent(token, { firstName: data.firstName, ... });
  toast.success("Élève créé");
  router.push('/dashboard/students');
};
```

**3. Migrer classes/page (45 min)** : Répliquer pattern students

### 🟡 Moyennes

**4. Migrer dashboard/attendance/payments/grades** : Pattern identique

**5. Swagger (45 min)** :
```bash
npm install @nestjs/swagger
```
```typescript
// main.ts
const config = new DocumentBuilder()
  .setTitle('Structura API').addBearerAuth().build();
SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
```

**6. TypeScript strict (30 min)** : `backend/tsconfig.json` → `"strict": true`

**7. Validation ENV (15 min)** :
```bash
npm install joi
```
```typescript
// app.module.ts
ConfigModule.forRoot({
  validationSchema: Joi.object({
    DATABASE_URL: Joi.string().required(),
    JWT_SECRET: Joi.string().required()
  })
})
```

---

## 🧪 Tests (Phase 8)

### Checklist Essentielle
**Backend** : Démarré 3001 • PostgreSQL + Redis OK • Logs sans erreur • Routes `/api/*` accessibles

**Frontend** : Démarré 3000 • Compilation OK • Console sans erreur

**Auth** : Register/Login OK • Token stocké • Headers API OK • Logout OK

**Modules** : Students/Classes/Attendance/Payments/Grades → CRUD + online/offline

**Network** : Requêtes vers `localhost:3001/api/*` • Header `Authorization: Bearer ...` • Pas CORS

**Outils** : Postman • Prisma Studio • DevTools Network/Application

---

## 🔐 Variables d'Environnement

### Backend (.env)
```env
PORT=3001
NODE_ENV=development
DATABASE_URL="postgresql://structura_admin:structura_dev_password@localhost:5432/structura_dev?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="dev-secret-key-change-in-production-12345"
JWT_REFRESH_SECRET="dev-refresh-secret-key-change-in-production-67890"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"
FRONTEND_URL="http://localhost:3000"
RESEND_API_KEY="re_VOTRE_NOUVELLE_CLE_API_ICI"  # ⚠️ À changer
EMAIL_FROM="Structura <noreply@structura.app>"
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL="http://localhost:3001/api"
NEXT_PUBLIC_USE_MOCK="false"
NEXT_PUBLIC_APP_NAME="Structura"
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"
UPLOAD_MAX_SIZE="5MB"
ALLOWED_FILE_TYPES="image/jpeg,image/png,image/webp,application/pdf"
```

---

## 📚 Documentation

**Projet** : CLAUDE.md • README.md • ARCHITECTURE.md • QUICK-START.md

**Refactoring** : REFACTORING_STATUS.md • MIGRATION_STUDENTS_COMPLETE.md • PHASE_6_STATUS.md • GUIDE_TEST_MIGRATION.md

**Sécurité** : SECURITY_ALERT.md • AUDIT-SECURITE-AUTHENTIFICATION.md

**Backend** : backend/README.md • BACKEND-ARCHITECTURE.md • backend/PRODUCTION-READY.md

**Ressources** : [NestJS](https://docs.nestjs.com/) • [Next.js](https://nextjs.org/docs) • [Prisma](https://www.prisma.io/docs) • [shadcn/ui](https://ui.shadcn.com/)

---

## 🆘 Support

### Problèmes Courants

**Backend ne démarre pas** → `docker ps` • `docker-compose down && up -d` • `docker-compose logs -f`

**Frontend erreurs TS** → `rm -rf node_modules && npm install` • Vérifier `.env.local` • `rm -rf .next`

**401 Unauthorized** → Token expiré (se reconnecter) • Vérifier `localStorage.structura_token` • Backend JWT_SECRET changé

**Erreur CORS** → `backend/.env` : `FRONTEND_URL=http://localhost:3000` • Vérifier `main.ts` CORS • Port 3000 frontend

**Prisma Client not found** → `npm run prisma:generate`

---

## 🎯 Prochaines Étapes

### Aujourd'hui
1. ⚠️ Révoquer clé Resend + nouvelle clé (5 min)
2. ✅ Tester page students (15 min)
3. 🔄 Migrer students/add (30 min)

### Cette Semaine
1. 🔄 Migrer classes + dashboard (1h30)
2. 🔄 Migrer attendance + payments + grades (1h45)
3. ✅ Tests complets (1h)

### Semaine Prochaine
1. 🔧 Swagger + strict + validation (1h30)
2. 📚 Documentation (1h)
3. 🚀 Préparation déploiement

---

## 📝 Notes Critiques

### ❌ À NE PAS FAIRE
- Commiter `.env` / `.env.local`
- Exposer secrets dans le code
- Push vers `main` sans tests
- Supprimer migrations Prisma sans comprendre
- `prisma db push` en production (utiliser `migrate deploy`)

### ✅ Bonnes Pratiques
- Tester localement avant push
- Branches pour features
- Commits clairs et fréquents
- Documenter changements importants
- Vérifier builds avant merge

### 🔒 Sécurité Production
- Changer tous les secrets
- HTTPS uniquement
- Rate limiting actif
- Monitoring logs
- Dépendances à jour

---

## 🎉 Résumé

**Structura** : Architecture moderne frontend/backend séparée • 50% refactoré • 7h restantes pour production-ready

**Acquis** : Séparation propre • Services API • Dépendances nettoyées • Sécurité améliorée

**Prochain** : Migrer 6 pages → Tests → Swagger → Production

**Bon développement ! 🚀**

---

**Créé par** : Dev Senior Claude | **Date** : 09/02/2026 | **Version** : 1.0.0 | **Projet** : Structura SaaS Multi-Tenant
