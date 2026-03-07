/**
 * Script pour réinitialiser les données de la base de données
 * Supprime toutes les données créées par les utilisateurs
 * Garde la structure de la base de données intacte
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Début de la réinitialisation de la base de données...');

  try {
    // Supprimer dans l'ordre inverse des dépendances
    console.log('🗑️  Suppression des grades...');
    await prisma.grade.deleteMany({});

    console.log('🗑️  Suppression des paiements...');
    await prisma.payment.deleteMany({});

    console.log('🗑️  Suppression des présences...');
    await prisma.attendance.deleteMany({});

    console.log('🗑️  Suppression des élèves...');
    await prisma.student.deleteMany({});

    console.log('🗑️  Suppression des classes...');
    await prisma.class.deleteMany({});

    console.log('🗑️  Suppression des années académiques...');
    await prisma.academicYear.deleteMany({});

    console.log('🗑️  Suppression de l\'historique des abonnements...');
    await prisma.subscriptionHistory.deleteMany({});

    console.log('🗑️  Suppression des utilisateurs...');
    await prisma.user.deleteMany({});

    console.log('🗑️  Suppression des tenants...');
    await prisma.tenant.deleteMany({});

    console.log('✅ Base de données réinitialisée avec succès !');
    console.log('');
    console.log('📝 Vous pouvez maintenant :');
    console.log('   1. Créer un nouveau compte (register)');
    console.log('   2. Créer une année académique');
    console.log('   3. Créer vos classes avec le système prédéfini');
    console.log('   4. Importer vos élèves');
  } catch (error) {
    console.error('❌ Erreur lors de la réinitialisation:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
