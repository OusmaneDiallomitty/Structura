/**
 * Bootstrap file - Charge les variables d'environnement AVANT tout
 * Ce fichier doit être importé en PREMIER dans main.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

// Chemins possibles pour .env (selon si on est en dev ou dist)
const possiblePaths = [
  resolve(process.cwd(), '.env'),           // Racine du projet
  resolve(__dirname, '..', '.env'),         // Depuis src/
  resolve(__dirname, '..', '..', '.env'),   // Depuis dist/
];

let loaded = false;

for (const envPath of possiblePaths) {
  const result = config({ path: envPath });

  if (!result.error) {
    loaded = true;
    break;
  }
}

if (!loaded) {
  console.error('❌ Could not find .env file in any of the expected locations!');
  process.exit(1);
}

// Vérifier que les variables critiques existent
const requiredVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'FRONTEND_URL',
  'BREVO_API_KEY',
];
const missingVars = requiredVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}

console.log('✅ ENV OK');
console.log('📦 NODE_ENV:', process.env.NODE_ENV);
console.log('📦 PORT:', process.env.PORT);

export {}; // Make this a module
