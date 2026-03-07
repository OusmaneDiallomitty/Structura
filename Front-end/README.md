# Structura - Frontend

Plateforme de gestion professionnelle pour écoles, commerces, ONG et petites entreprises.

## Stack Technique

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript 5**
- **Tailwind CSS 4**
- **Turbopack** (dev server ultra-rapide)

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## Build Production

```bash
npm run build
npm start
```

## Structure du Projet

```
Front-end/
├── src/
│   ├── app/              # App Router (pages, layouts)
│   ├── components/       # Composants réutilisables
│   ├── lib/             # Utilitaires et helpers
│   └── types/           # Types TypeScript
├── public/              # Assets statiques
└── tailwind.config.ts   # Configuration Tailwind
```

## Commandes

- `npm run dev` - Serveur de développement avec Turbopack
- `npm run build` - Build de production
- `npm start` - Démarrer le serveur de production
- `npm run lint` - Linter le code
