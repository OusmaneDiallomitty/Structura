/**
 * Script de mise à jour des credentials du Super Admin.
 * Usage : npx ts-node -r tsconfig-paths/register scripts/update-super-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const NEW_EMAIL    = 'ousmanedmitty@gmail.com';
const NEW_PASSWORD = 'Boudirou1997/*';

async function main() {
  const existing = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
  });

  if (!existing) {
    console.error('\n❌ Aucun SUPER_ADMIN trouvé en base.\n');
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 12);

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      email:           NEW_EMAIL,
      password:        hashedPassword,
      emailVerified:   true,
      isActive:        true,
      currentSessionId: null, // Reset session pour forcer reconnexion
    },
  });

  console.log('\n✅ Super Admin mis à jour !');
  console.log(`   Email    : ${NEW_EMAIL}`);
  console.log(`   ID       : ${existing.id}\n`);
}

main()
  .catch((e) => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
