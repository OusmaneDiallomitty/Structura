/**
 * Script pour réinitialiser TOUTES les données de la base de données
 * Supprime tous les utilisateurs, tenants et données associées
 * Garde la structure (schéma) intacte
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Début de la réinitialisation complète...');

  try {
    // Commerce
    console.log('🗑️  Commerce — mouvements de stock...');
    await prisma.stockMovement.deleteMany({});
    console.log('🗑️  Commerce — lignes de vente...');
    await prisma.saleItem.deleteMany({});
    console.log('🗑️  Commerce — ventes...');
    await prisma.sale.deleteMany({});
    console.log('🗑️  Commerce — produits...');
    await prisma.product.deleteMany({});
    console.log('🗑️  Commerce — catégories produits...');
    await prisma.productCategory.deleteMany({});
    console.log('🗑️  Commerce — clients...');
    await prisma.commerceCustomer.deleteMany({});
    console.log('🗑️  Commerce — fournisseurs...');
    await prisma.supplier.deleteMany({});

    // Scolaire
    console.log('🗑️  Scolaire — verrouillages trimestre...');
    await prisma.trimesterLock.deleteMany({});
    console.log('🗑️  Scolaire — coefficients matières...');
    await prisma.subjectCoefficient.deleteMany({});
    console.log('🗑️  Scolaire — compositions...');
    await prisma.composition.deleteMany({});
    console.log('🗑️  Scolaire — évaluations...');
    await prisma.evaluation.deleteMany({});
    console.log('🗑️  Scolaire — dépenses...');
    await prisma.expense.deleteMany({});
    console.log('🗑️  Scolaire — paiements...');
    await prisma.payment.deleteMany({});
    console.log('🗑️  Scolaire — présences...');
    await prisma.attendance.deleteMany({});
    console.log('🗑️  Scolaire — matières de classe...');
    await prisma.classSubject.deleteMany({});
    console.log('🗑️  Scolaire — élèves...');
    await prisma.student.deleteMany({});
    console.log('🗑️  Scolaire — classes...');
    await prisma.class.deleteMany({});
    console.log('🗑️  Scolaire — années académiques...');
    await prisma.academicYear.deleteMany({});

    // Notifications & alertes
    console.log('🗑️  Notifications...');
    await prisma.notification.deleteMany({});
    console.log('🗑️  Push subscriptions...');
    await prisma.pushSubscription.deleteMany({});
    console.log('🗑️  Alertes snoozées...');
    await prisma.alertSnooze.deleteMany({});

    // Abonnements & facturation
    console.log('🗑️  Paiements abonnements (Djomy)...');
    await prisma.subscriptionPayment.deleteMany({});
    console.log('🗑️  Historique abonnements...');
    await prisma.subscriptionHistory.deleteMany({});

    // Audit & notes admin
    console.log('🗑️  Logs d\'audit...');
    await prisma.auditLog.deleteMany({});
    console.log('🗑️  Notes admin (tenants)...');
    await prisma.tenantNote.deleteMany({});

    // Utilisateurs & tenants
    console.log('🗑️  Utilisateurs...');
    await prisma.user.deleteMany({});
    console.log('🗑️  Tenants...');
    await prisma.tenant.deleteMany({});

    console.log('');
    console.log('✅ Base de données réinitialisée avec succès !');
    console.log('   → Tous les utilisateurs et tenants supprimés');
    console.log('   → Structure (schéma) conservée intacte');
    console.log('');
    console.log('📝 Prochaine étape : créer un nouveau compte sur /register');
  } catch (error) {
    console.error('❌ Erreur lors de la réinitialisation:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
