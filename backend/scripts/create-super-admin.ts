/**
 * Script de création du Super Admin Structura.
 *
 * Usage :
 *   npx ts-node -r tsconfig-paths/register scripts/create-super-admin.ts <email> <password> [prenom] [nom]
 *
 * Ou via variables d'environnement :
 *   ADMIN_EMAIL=admin@structura.app ADMIN_PASSWORD=MonMotDePasse npx ts-node scripts/create-super-admin.ts
 *
 * Ce script :
 *   1. Crée le tenant "Structura Platform" (subdomain: structura-admin) si inexistant
 *   2. Crée l'utilisateur SUPER_ADMIN dans ce tenant
 *   3. Marque le compte comme vérifié et actif (pas besoin d'email de vérification)
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Charger le .env depuis la racine du backend
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const ADMIN_TENANT_SUBDOMAIN = 'structura-admin';
const ADMIN_TENANT_NAME      = 'Structura Platform';

async function main() {
  const email     = process.env.ADMIN_EMAIL    || process.argv[2];
  const password  = process.env.ADMIN_PASSWORD || process.argv[3];
  const firstName = process.argv[4] || 'Super';
  const lastName  = process.argv[5] || 'Admin';

  // ─── Validation des arguments ──────────────────────────────────────────
  if (!email || !password) {
    console.error('\n❌ Arguments manquants.\n');
    console.error('Usage :');
    console.error('  npx ts-node scripts/create-super-admin.ts <email> <password> [prenom] [nom]\n');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('\n❌ Le mot de passe doit contenir au moins 12 caractères.\n');
    process.exit(1);
  }

  console.log('\n🚀 Création du Super Admin Structura...\n');

  // ─── Étape 1 : Tenant admin ────────────────────────────────────────────
  let adminTenant = await prisma.tenant.findFirst({
    where: { subdomain: ADMIN_TENANT_SUBDOMAIN },
  });

  if (!adminTenant) {
    adminTenant = await prisma.tenant.create({
      data: {
        name:               ADMIN_TENANT_NAME,
        type:               'PLATFORM',
        subdomain:          ADMIN_TENANT_SUBDOMAIN,
        isActive:           true,
        subscriptionPlan:   'PREMIUM',
        subscriptionStatus: 'ACTIVE',
      },
    });
    console.log(`✅ Tenant admin créé : ${adminTenant.name} (${adminTenant.id})`);
  } else {
    console.log(`ℹ️  Tenant admin existant : ${adminTenant.name} (${adminTenant.id})`);
  }

  // ─── Étape 2 : Vérifier si le super admin existe déjà ─────────────────
  const existing = await prisma.user.findFirst({
    where: { email, tenantId: adminTenant.id },
  });

  if (existing) {
    console.log(`\n⚠️  Un compte existe déjà avec cet email dans le tenant admin : ${email}`);
    console.log('   Aucune modification effectuée.\n');
    return;
  }

  // ─── Étape 3 : Créer le super admin ───────────────────────────────────
  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      email,
      password:           hashedPassword,
      firstName,
      lastName,
      role:               'SUPER_ADMIN',
      tenantId:           adminTenant.id,
      emailVerified:      true,          // pas besoin de vérification email
      isActive:           true,
      onboardingCompleted: true,
      mustChangePassword: false,
    },
  });

  console.log('\n✅ Super Admin créé avec succès !');
  console.log('─────────────────────────────────────');
  console.log(`   Email    : ${admin.email}`);
  console.log(`   Prénom   : ${admin.firstName}`);
  console.log(`   Nom      : ${admin.lastName}`);
  console.log(`   Rôle     : ${admin.role}`);
  console.log(`   Tenant   : ${adminTenant.name}`);
  console.log(`   ID       : ${admin.id}`);
  console.log('─────────────────────────────────────');
  console.log('\n⚠️  Conservez ces informations en sécurité.');
  console.log('   Ne commitez jamais le mot de passe dans git.\n');
}

main()
  .catch((error) => {
    console.error('\n❌ Erreur :', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
