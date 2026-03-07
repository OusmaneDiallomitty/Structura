/**
 * PM2 Ecosystem Config — Structura (Backend + Frontend + Admin)
 *
 * Utilisation :
 *   # Backend
 *   cd backend && npm run build
 *
 *   # Frontend
 *   cd Front-end && npm run build
 *
 *   # Admin
 *   cd admin && npm run build
 *
 *   # Démarrer tous les processus en production
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save        # Sauvegarder la config PM2
 *   pm2 startup     # Démarrer automatiquement au boot serveur
 *
 * Monitoring :
 *   pm2 status          # État de tous les processus
 *   pm2 logs            # Logs temps réel
 *   pm2 monit           # Dashboard CPU/RAM interactif
 *   pm2 restart all     # Redémarrer sans downtime (0-downtime reload)
 *   pm2 reload all      # Rechargement gracieux (clusters)
 */

module.exports = {
  apps: [

    // =========================================================================
    // BACKEND — NestJS API (port 3001)
    // =========================================================================
    {
      name: 'structura-backend',
      script: './backend/dist/main.js',

      // Cluster mode — utilise tous les cores CPU disponibles
      // -1 = tous les cores (ex: 4 cores → 4 workers = 4x la capacité)
      // Chaque worker partage Redis et PostgreSQL → aucune donnée dupliquée
      instances: -1,
      exec_mode: 'cluster',

      // Comportement en cas de crash
      autorestart:    true,
      max_restarts:   10,     // Abandon après 10 crashes consécutifs
      restart_delay:  3000,   // Attendre 3s entre chaque restart
      min_uptime:     5000,   // Stable après 5s de uptime

      // Redémarrage auto si fuite mémoire
      max_memory_restart: '500M',

      // Variables d'environnement
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },

      // Logs
      log_file:        './logs/backend-combined.log',
      out_file:        './logs/backend-out.log',
      error_file:      './logs/backend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:      true,  // Un fichier log par application (pas par worker)
    },

    // =========================================================================
    // FRONTEND — Next.js SaaS app (port 3000)
    // =========================================================================
    {
      name: 'structura-frontend',
      script: 'node_modules/.bin/next',
      args:   'start',
      cwd:    './Front-end',

      // Fork mode pour Next.js — il gère lui-même son clustering interne
      instances: 1,
      exec_mode: 'fork',

      autorestart:        true,
      max_restarts:       10,
      restart_delay:      3000,
      min_uptime:         10000,  // Next.js prend plus de temps à démarrer
      max_memory_restart: '800M', // Next.js consomme plus de mémoire

      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      log_file:        './logs/frontend-combined.log',
      out_file:        './logs/frontend-out.log',
      error_file:      './logs/frontend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:      true,
    },

    // =========================================================================
    // ADMIN — Next.js Admin panel (port 3002)
    // =========================================================================
    {
      name: 'structura-admin',
      script: 'node_modules/.bin/next',
      args:   'start -p 3002',
      cwd:    './admin',

      instances: 1,
      exec_mode: 'fork',

      autorestart:        true,
      max_restarts:       10,
      restart_delay:      3000,
      min_uptime:         10000,
      max_memory_restart: '400M',

      env: {
        NODE_ENV: 'development',
        PORT: 3002,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
      },

      log_file:        './logs/admin-combined.log',
      out_file:        './logs/admin-out.log',
      error_file:      './logs/admin-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:      true,
    },

  ],
};
