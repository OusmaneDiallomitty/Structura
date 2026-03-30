/**
 * Catalogues sectoriels pour l'onboarding commerce
 *
 * Chaque secteur contient des catégories et produits pré-remplis
 * avec des prix indicatifs en GNF (Guinée).
 *
 * Unités supportées :
 *   Solides : pièce · kg · sac · carton · boîte · sachet · caisse · botte
 *             rouleau · mètre · m² · barre · planche · tonne · palette
 *   Liquides : litre · bidon · bouteille · pot · flacon · jerrican
 *   Paires   : paire
 *   Forfait  : forfait · heure
 */

export interface CatalogProduct {
  name: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  stockAlert: number;
}

export interface CatalogCategory {
  name: string;
  products: CatalogProduct[];
}

export interface SectorTemplate {
  id: string;
  label: string;
  emoji: string;
  description: string;
  categories: CatalogCategory[];
}

// ─── UNITÉS disponibles ───────────────────────────────────────────────────────
export const UNITS = [
  // Général
  { value: "pièce",     label: "Pièce" },
  { value: "paire",     label: "Paire" },
  { value: "forfait",   label: "Forfait" },
  // Poids / masse
  { value: "kg",        label: "Kilogramme (kg)" },
  { value: "tonne",     label: "Tonne" },
  // Volume liquide
  { value: "litre",     label: "Litre (L)" },
  { value: "bidon",     label: "Bidon" },
  { value: "bouteille", label: "Bouteille" },
  { value: "flacon",    label: "Flacon" },
  { value: "pot",       label: "Pot" },
  { value: "jerrican",  label: "Jerrican" },
  // Conditionnement solide
  { value: "sac",       label: "Sac" },
  { value: "sachet",    label: "Sachet" },
  { value: "boîte",     label: "Boîte" },
  { value: "carton",    label: "Carton" },
  { value: "caisse",    label: "Caisse" },
  { value: "botte",     label: "Botte" },
  // Construction / matériaux
  { value: "barre",     label: "Barre" },
  { value: "planche",   label: "Planche" },
  { value: "mètre",     label: "Mètre (m)" },
  { value: "m²",        label: "Mètre carré (m²)" },
  { value: "rouleau",   label: "Rouleau" },
] as const;

export type UnitValue = typeof UNITS[number]["value"];

// ─── SECTEURS ─────────────────────────────────────────────────────────────────

export const SECTOR_TEMPLATES: SectorTemplate[] = [
  // ── 1. CONSTRUCTION ───────────────────────────────────────────────────────
  {
    id: "construction",
    label: "Matériaux de construction",
    emoji: "🏗️",
    description: "Ciment, fer, carrelage, peinture, plomberie, électricité...",
    categories: [
      {
        name: "Gros œuvre",
        products: [
          { name: "Ciment Portland 50kg", unit: "sac",   buyPrice: 85000,  sellPrice: 95000,  stockAlert: 20 },
          { name: "Ciment CPJ 35",        unit: "sac",   buyPrice: 75000,  sellPrice: 85000,  stockAlert: 20 },
          { name: "Fer à béton ø8mm",     unit: "barre", buyPrice: 18000,  sellPrice: 22000,  stockAlert: 50 },
          { name: "Fer à béton ø10mm",    unit: "barre", buyPrice: 28000,  sellPrice: 34000,  stockAlert: 50 },
          { name: "Fer à béton ø12mm",    unit: "barre", buyPrice: 40000,  sellPrice: 47000,  stockAlert: 30 },
          { name: "Sable fin",            unit: "m²",    buyPrice: 150000, sellPrice: 200000, stockAlert: 5  },
          { name: "Gravier",              unit: "m²",    buyPrice: 180000, sellPrice: 230000, stockAlert: 5  },
          { name: "Parpaing creux 15",    unit: "pièce", buyPrice: 2500,   sellPrice: 3000,   stockAlert: 200 },
        ],
      },
      {
        name: "Toiture & Charpente",
        products: [
          { name: "Tôle ondulée galva 6m", unit: "pièce",  buyPrice: 65000,  sellPrice: 75000,  stockAlert: 10 },
          { name: "Tôle ondulée galva 4m", unit: "pièce",  buyPrice: 45000,  sellPrice: 52000,  stockAlert: 10 },
          { name: "Charpente métallique",  unit: "barre",  buyPrice: 55000,  sellPrice: 65000,  stockAlert: 10 },
          { name: "Pointe tôle 75mm",      unit: "kg",     buyPrice: 15000,  sellPrice: 18000,  stockAlert: 10 },
          { name: "Faitière",              unit: "pièce",  buyPrice: 8000,   sellPrice: 10000,  stockAlert: 5  },
        ],
      },
      {
        name: "Carrelage & Revêtement",
        products: [
          { name: "Carrelage sol 60x60",   unit: "m²",    buyPrice: 55000,  sellPrice: 70000,  stockAlert: 10 },
          { name: "Faïence mur 30x60",     unit: "m²",    buyPrice: 45000,  sellPrice: 58000,  stockAlert: 10 },
          { name: "Colle carrelage",       unit: "sac",   buyPrice: 22000,  sellPrice: 28000,  stockAlert: 10 },
          { name: "Joint carrelage",       unit: "sac",   buyPrice: 12000,  sellPrice: 16000,  stockAlert: 5  },
          { name: "Sable maçonnerie",      unit: "sac",   buyPrice: 8000,   sellPrice: 10000,  stockAlert: 20 },
        ],
      },
      {
        name: "Peinture",
        products: [
          { name: "Peinture vinylique 20L", unit: "bidon", buyPrice: 120000, sellPrice: 145000, stockAlert: 5 },
          { name: "Peinture vinylique 4L",  unit: "pot",   buyPrice: 28000,  sellPrice: 35000,  stockAlert: 5 },
          { name: "Peinture huile 20L",     unit: "bidon", buyPrice: 160000, sellPrice: 190000, stockAlert: 5 },
          { name: "Sous-couche 20L",        unit: "bidon", buyPrice: 95000,  sellPrice: 115000, stockAlert: 3 },
          { name: "White Spirit 5L",        unit: "bidon", buyPrice: 35000,  sellPrice: 42000,  stockAlert: 3 },
          { name: "Enduit plâtre 25kg",     unit: "sac",   buyPrice: 32000,  sellPrice: 40000,  stockAlert: 5 },
        ],
      },
      {
        name: "Plomberie",
        products: [
          { name: "Tube PVC 32mm (3m)",   unit: "barre", buyPrice: 8000,  sellPrice: 10000, stockAlert: 10 },
          { name: "Tube PVC 63mm (3m)",   unit: "barre", buyPrice: 18000, sellPrice: 22000, stockAlert: 10 },
          { name: "Tube PVC 110mm (3m)",  unit: "barre", buyPrice: 32000, sellPrice: 38000, stockAlert: 5  },
          { name: "Robinet chromé",       unit: "pièce", buyPrice: 45000, sellPrice: 55000, stockAlert: 5  },
          { name: "Coude PVC 90°",        unit: "pièce", buyPrice: 1500,  sellPrice: 2000,  stockAlert: 20 },
          { name: "Tuyau souple 1m",      unit: "pièce", buyPrice: 12000, sellPrice: 15000, stockAlert: 5  },
          { name: "Ciment colle",         unit: "sac",   buyPrice: 18000, sellPrice: 22000, stockAlert: 5  },
        ],
      },
      {
        name: "Électricité bâtiment",
        products: [
          { name: "Câble électrique 2x1.5mm",  unit: "mètre", buyPrice: 2000,  sellPrice: 2500,  stockAlert: 50 },
          { name: "Câble électrique 2x2.5mm",  unit: "mètre", buyPrice: 3000,  sellPrice: 3800,  stockAlert: 50 },
          { name: "Disjoncteur 16A",           unit: "pièce", buyPrice: 18000, sellPrice: 22000, stockAlert: 5  },
          { name: "Prise murale double",        unit: "pièce", buyPrice: 8000,  sellPrice: 10000, stockAlert: 10 },
          { name: "Interrupteur simple",        unit: "pièce", buyPrice: 5000,  sellPrice: 6500,  stockAlert: 10 },
          { name: "Tableau électrique 12 pos.", unit: "pièce", buyPrice: 55000, sellPrice: 68000, stockAlert: 3  },
          { name: "Ampoule LED 9W",             unit: "pièce", buyPrice: 8000,  sellPrice: 10000, stockAlert: 10 },
          { name: "Gaine IRL 20mm (50m)",       unit: "rouleau", buyPrice: 45000, sellPrice: 55000, stockAlert: 3 },
        ],
      },
    ],
  },

  // ── 2. ALIMENTATION ───────────────────────────────────────────────────────
  {
    id: "alimentation",
    label: "Alimentation générale",
    emoji: "🛒",
    description: "Céréales, huiles, boissons, conserves, condiments...",
    categories: [
      {
        name: "Céréales & Féculents",
        products: [
          { name: "Riz parfumé 25kg",   unit: "sac",   buyPrice: 200000, sellPrice: 225000, stockAlert: 10 },
          { name: "Riz ordinaire 50kg", unit: "sac",   buyPrice: 320000, sellPrice: 360000, stockAlert: 10 },
          { name: "Farine de blé 50kg", unit: "sac",   buyPrice: 280000, sellPrice: 320000, stockAlert: 5  },
          { name: "Mil 25kg",           unit: "sac",   buyPrice: 120000, sellPrice: 145000, stockAlert: 5  },
          { name: "Maïs 50kg",          unit: "sac",   buyPrice: 150000, sellPrice: 175000, stockAlert: 5  },
          { name: "Semoule 1kg",        unit: "sachet",buyPrice: 8000,   sellPrice: 10000,  stockAlert: 20 },
        ],
      },
      {
        name: "Huiles & Graisses",
        products: [
          { name: "Huile palme 5L",        unit: "bidon", buyPrice: 55000,  sellPrice: 65000,  stockAlert: 10 },
          { name: "Huile végétale 5L",     unit: "bidon", buyPrice: 60000,  sellPrice: 72000,  stockAlert: 10 },
          { name: "Huile arachide 5L",     unit: "bidon", buyPrice: 70000,  sellPrice: 85000,  stockAlert: 5  },
          { name: "Beurre de karité 1kg",  unit: "pot",   buyPrice: 35000,  sellPrice: 42000,  stockAlert: 5  },
          { name: "Huile 1L",              unit: "bouteille", buyPrice: 15000, sellPrice: 18000, stockAlert: 20 },
        ],
      },
      {
        name: "Sucre & Sel",
        products: [
          { name: "Sucre 50kg",       unit: "sac",    buyPrice: 320000, sellPrice: 360000, stockAlert: 5  },
          { name: "Sucre 1kg",        unit: "sachet", buyPrice: 7000,   sellPrice: 8500,   stockAlert: 20 },
          { name: "Sel iodé 25kg",    unit: "sac",    buyPrice: 55000,  sellPrice: 65000,  stockAlert: 5  },
          { name: "Sel fin 500g",     unit: "sachet", buyPrice: 2000,   sellPrice: 2500,   stockAlert: 20 },
        ],
      },
      {
        name: "Boissons",
        products: [
          { name: "Eau minérale 1.5L",   unit: "bouteille", buyPrice: 6000,  sellPrice: 8000,  stockAlert: 20 },
          { name: "Eau minérale 0.5L",   unit: "bouteille", buyPrice: 3000,  sellPrice: 4000,  stockAlert: 20 },
          { name: "Jus de fruit 1L",     unit: "bouteille", buyPrice: 12000, sellPrice: 15000, stockAlert: 10 },
          { name: "Coca-Cola 33cl",      unit: "bouteille", buyPrice: 5000,  sellPrice: 6500,  stockAlert: 20 },
          { name: "Bière Flag 65cl",     unit: "bouteille", buyPrice: 12000, sellPrice: 15000, stockAlert: 10 },
          { name: "Lait UHT 1L",         unit: "bouteille", buyPrice: 18000, sellPrice: 22000, stockAlert: 10 },
        ],
      },
      {
        name: "Conserves",
        products: [
          { name: "Tomate concentrée 800g",  unit: "boîte", buyPrice: 12000, sellPrice: 15000, stockAlert: 10 },
          { name: "Sardines à l'huile",      unit: "boîte", buyPrice: 8000,  sellPrice: 10000, stockAlert: 10 },
          { name: "Thon en conserve",        unit: "boîte", buyPrice: 18000, sellPrice: 22000, stockAlert: 5  },
          { name: "Corned-beef",             unit: "boîte", buyPrice: 20000, sellPrice: 25000, stockAlert: 5  },
          { name: "Haricots rouges 800g",    unit: "boîte", buyPrice: 10000, sellPrice: 13000, stockAlert: 10 },
        ],
      },
      {
        name: "Condiments & Épices",
        products: [
          { name: "Bouillon Maggi (boîte)",   unit: "boîte",  buyPrice: 25000, sellPrice: 30000, stockAlert: 5  },
          { name: "Bouillon Maggi (sachet)",  unit: "sachet", buyPrice: 500,   sellPrice: 700,   stockAlert: 50 },
          { name: "Piment séché",             unit: "sachet", buyPrice: 1500,  sellPrice: 2000,  stockAlert: 20 },
          { name: "Moutarde",                 unit: "pot",    buyPrice: 8000,  sellPrice: 10000, stockAlert: 5  },
          { name: "Vinaigre 1L",              unit: "bouteille", buyPrice: 8000, sellPrice: 10000, stockAlert: 5 },
        ],
      },
      {
        name: "Produits ménagers",
        products: [
          { name: "Savon de ménage 1kg",    unit: "kg",     buyPrice: 12000, sellPrice: 15000, stockAlert: 10 },
          { name: "Lessive en poudre 1kg",  unit: "sachet", buyPrice: 12000, sellPrice: 15000, stockAlert: 10 },
          { name: "Javel 5L",               unit: "bidon",  buyPrice: 18000, sellPrice: 22000, stockAlert: 5  },
          { name: "Éponge vaisselle",       unit: "pièce",  buyPrice: 2000,  sellPrice: 2500,  stockAlert: 10 },
          { name: "Allumettes (boîte)",     unit: "boîte",  buyPrice: 500,   sellPrice: 700,   stockAlert: 20 },
        ],
      },
    ],
  },

  // ── 3. ÉLECTRONIQUE ───────────────────────────────────────────────────────
  {
    id: "electronique",
    label: "Matériaux électroniques",
    emoji: "📱",
    description: "Téléphones, accessoires, électroménager, audio...",
    categories: [
      {
        name: "Téléphonie mobile",
        products: [
          { name: "Samsung Galaxy A15",   unit: "pièce", buyPrice: 900000,  sellPrice: 1100000, stockAlert: 3 },
          { name: "Tecno Spark 20",       unit: "pièce", buyPrice: 650000,  sellPrice: 800000,  stockAlert: 3 },
          { name: "Infinix Hot 40",       unit: "pièce", buyPrice: 750000,  sellPrice: 900000,  stockAlert: 3 },
          { name: "Itel A70",             unit: "pièce", buyPrice: 350000,  sellPrice: 450000,  stockAlert: 3 },
          { name: "iPhone 13",            unit: "pièce", buyPrice: 3500000, sellPrice: 4200000, stockAlert: 2 },
        ],
      },
      {
        name: "Accessoires téléphone",
        products: [
          { name: "Chargeur rapide USB-C", unit: "pièce", buyPrice: 25000, sellPrice: 35000, stockAlert: 10 },
          { name: "Câble USB-C 1m",        unit: "pièce", buyPrice: 8000,  sellPrice: 12000, stockAlert: 15 },
          { name: "Écouteurs filaires",    unit: "pièce", buyPrice: 12000, sellPrice: 18000, stockAlert: 10 },
          { name: "Batterie externe 10000mAh", unit: "pièce", buyPrice: 65000, sellPrice: 85000, stockAlert: 5 },
          { name: "Verre trempé",          unit: "pièce", buyPrice: 5000,  sellPrice: 8000,  stockAlert: 15 },
          { name: "Coque silicone",        unit: "pièce", buyPrice: 8000,  sellPrice: 12000, stockAlert: 15 },
          { name: "Support voiture",       unit: "pièce", buyPrice: 18000, sellPrice: 25000, stockAlert: 5  },
        ],
      },
      {
        name: "Électroménager",
        products: [
          { name: "Ventilateur sur pied",  unit: "pièce", buyPrice: 180000, sellPrice: 230000, stockAlert: 3 },
          { name: "Fer à repasser",        unit: "pièce", buyPrice: 65000,  sellPrice: 85000,  stockAlert: 3 },
          { name: "Mixeur blender",        unit: "pièce", buyPrice: 120000, sellPrice: 160000, stockAlert: 3 },
          { name: "Radio réveil",          unit: "pièce", buyPrice: 45000,  sellPrice: 60000,  stockAlert: 3 },
          { name: "Télévision 32 pouces",  unit: "pièce", buyPrice: 850000, sellPrice: 1100000,stockAlert: 2 },
          { name: "Réfrigérateur 100L",    unit: "pièce", buyPrice: 1800000,sellPrice: 2200000,stockAlert: 1 },
        ],
      },
      {
        name: "Audio & Vidéo",
        products: [
          { name: "Enceinte Bluetooth",     unit: "pièce", buyPrice: 85000,  sellPrice: 120000, stockAlert: 5 },
          { name: "Casque audio",           unit: "pièce", buyPrice: 35000,  sellPrice: 50000,  stockAlert: 5 },
          { name: "Décodeur TNT",           unit: "pièce", buyPrice: 65000,  sellPrice: 85000,  stockAlert: 3 },
          { name: "Antenne parabolique",    unit: "pièce", buyPrice: 120000, sellPrice: 160000, stockAlert: 3 },
          { name: "Câble HDMI 1.5m",        unit: "pièce", buyPrice: 12000,  sellPrice: 18000,  stockAlert: 5 },
        ],
      },
      {
        name: "Informatique",
        products: [
          { name: "Clé USB 32GB",          unit: "pièce", buyPrice: 30000,  sellPrice: 45000,  stockAlert: 5  },
          { name: "Clé USB 64GB",          unit: "pièce", buyPrice: 55000,  sellPrice: 75000,  stockAlert: 5  },
          { name: "Souris sans fil",        unit: "pièce", buyPrice: 45000,  sellPrice: 65000,  stockAlert: 5  },
          { name: "Clavier USB",            unit: "pièce", buyPrice: 35000,  sellPrice: 50000,  stockAlert: 5  },
          { name: "Laptop sac de transport",unit: "pièce", buyPrice: 35000,  sellPrice: 50000,  stockAlert: 3  },
          { name: "Disque externe 1TB",     unit: "pièce", buyPrice: 350000, sellPrice: 480000, stockAlert: 2  },
        ],
      },
    ],
  },

  // ── 4. HABITS ─────────────────────────────────────────────────────────────
  {
    id: "habits",
    label: "Boutique habits",
    emoji: "👗",
    description: "Vêtements homme, femme, enfant, tissus, accessoires...",
    categories: [
      {
        name: "Homme",
        products: [
          { name: "Chemise habillée homme",  unit: "pièce", buyPrice: 80000,  sellPrice: 120000, stockAlert: 3 },
          { name: "Pantalon chino homme",    unit: "pièce", buyPrice: 90000,  sellPrice: 140000, stockAlert: 3 },
          { name: "T-shirt homme",           unit: "pièce", buyPrice: 30000,  sellPrice: 50000,  stockAlert: 5 },
          { name: "Boubou guinéen homme",    unit: "pièce", buyPrice: 150000, sellPrice: 250000, stockAlert: 3 },
          { name: "Costume complet",         unit: "pièce", buyPrice: 350000, sellPrice: 550000, stockAlert: 2 },
          { name: "Short homme",             unit: "pièce", buyPrice: 25000,  sellPrice: 40000,  stockAlert: 5 },
        ],
      },
      {
        name: "Femme",
        products: [
          { name: "Robe africaine",          unit: "pièce", buyPrice: 120000, sellPrice: 200000, stockAlert: 3 },
          { name: "Jupe longue",             unit: "pièce", buyPrice: 55000,  sellPrice: 85000,  stockAlert: 3 },
          { name: "Blouse femme",            unit: "pièce", buyPrice: 65000,  sellPrice: 100000, stockAlert: 3 },
          { name: "Tailleur femme",          unit: "pièce", buyPrice: 180000, sellPrice: 280000, stockAlert: 2 },
          { name: "Pagne africain (6m)",     unit: "pièce", buyPrice: 80000,  sellPrice: 130000, stockAlert: 5 },
          { name: "Leggings",                unit: "pièce", buyPrice: 20000,  sellPrice: 35000,  stockAlert: 5 },
        ],
      },
      {
        name: "Enfant",
        products: [
          { name: "Robe enfant fille",       unit: "pièce", buyPrice: 35000, sellPrice: 55000, stockAlert: 3 },
          { name: "Ensemble enfant garçon",  unit: "pièce", buyPrice: 40000, sellPrice: 65000, stockAlert: 3 },
          { name: "Pyjama enfant",           unit: "pièce", buyPrice: 30000, sellPrice: 50000, stockAlert: 3 },
          { name: "T-shirt enfant",          unit: "pièce", buyPrice: 15000, sellPrice: 25000, stockAlert: 5 },
          { name: "Short enfant",            unit: "pièce", buyPrice: 12000, sellPrice: 20000, stockAlert: 5 },
        ],
      },
      {
        name: "Tissus",
        products: [
          { name: "Tissu wax (par mètre)",   unit: "mètre", buyPrice: 25000,  sellPrice: 38000,  stockAlert: 5 },
          { name: "Tissu bazin riche (m)",   unit: "mètre", buyPrice: 45000,  sellPrice: 70000,  stockAlert: 5 },
          { name: "Tissu soie (par mètre)",  unit: "mètre", buyPrice: 30000,  sellPrice: 50000,  stockAlert: 5 },
          { name: "Tissu coton (par mètre)", unit: "mètre", buyPrice: 15000,  sellPrice: 25000,  stockAlert: 5 },
        ],
      },
      {
        name: "Accessoires mode",
        products: [
          { name: "Ceinture cuir homme",    unit: "pièce", buyPrice: 25000, sellPrice: 40000, stockAlert: 5 },
          { name: "Sac à main femme",       unit: "pièce", buyPrice: 80000, sellPrice: 130000,stockAlert: 3 },
          { name: "Chapeau / casquette",    unit: "pièce", buyPrice: 20000, sellPrice: 35000, stockAlert: 5 },
          { name: "Foulard femme",          unit: "pièce", buyPrice: 18000, sellPrice: 30000, stockAlert: 5 },
          { name: "Lunettes de soleil",     unit: "pièce", buyPrice: 15000, sellPrice: 28000, stockAlert: 5 },
        ],
      },
    ],
  },

  // ── 5. CHAUSSURES ─────────────────────────────────────────────────────────
  {
    id: "chaussures",
    label: "Boutique chaussures",
    emoji: "👟",
    description: "Chaussures homme, femme, enfant, sport...",
    categories: [
      {
        name: "Homme",
        products: [
          { name: "Chaussures habillées homme",  unit: "paire", buyPrice: 150000, sellPrice: 220000, stockAlert: 3 },
          { name: "Mocassins cuir",              unit: "paire", buyPrice: 120000, sellPrice: 180000, stockAlert: 3 },
          { name: "Baskets homme",               unit: "paire", buyPrice: 85000,  sellPrice: 130000, stockAlert: 3 },
          { name: "Sandales homme",              unit: "paire", buyPrice: 35000,  sellPrice: 55000,  stockAlert: 5 },
          { name: "Bottes homme",                unit: "paire", buyPrice: 180000, sellPrice: 270000, stockAlert: 2 },
        ],
      },
      {
        name: "Femme",
        products: [
          { name: "Escarpins femme",             unit: "paire", buyPrice: 90000,  sellPrice: 140000, stockAlert: 3 },
          { name: "Ballerines",                  unit: "paire", buyPrice: 55000,  sellPrice: 85000,  stockAlert: 3 },
          { name: "Sandales femme",              unit: "paire", buyPrice: 45000,  sellPrice: 70000,  stockAlert: 5 },
          { name: "Boots femme",                 unit: "paire", buyPrice: 130000, sellPrice: 200000, stockAlert: 2 },
          { name: "Chaussures sport femme",      unit: "paire", buyPrice: 80000,  sellPrice: 120000, stockAlert: 3 },
        ],
      },
      {
        name: "Enfant",
        products: [
          { name: "Chaussures école enfant",     unit: "paire", buyPrice: 45000,  sellPrice: 70000,  stockAlert: 3 },
          { name: "Baskets enfant",              unit: "paire", buyPrice: 55000,  sellPrice: 85000,  stockAlert: 3 },
          { name: "Sandales enfant",             unit: "paire", buyPrice: 20000,  sellPrice: 32000,  stockAlert: 5 },
          { name: "Chaussures bébé",             unit: "paire", buyPrice: 15000,  sellPrice: 25000,  stockAlert: 5 },
        ],
      },
      {
        name: "Sport",
        products: [
          { name: "Crampons football",           unit: "paire", buyPrice: 80000,  sellPrice: 130000, stockAlert: 3 },
          { name: "Chaussures running",          unit: "paire", buyPrice: 120000, sellPrice: 190000, stockAlert: 3 },
          { name: "Chaussures multisport",       unit: "paire", buyPrice: 90000,  sellPrice: 140000, stockAlert: 3 },
          { name: "Chaussettes sport (paire)",   unit: "paire", buyPrice: 5000,   sellPrice: 8000,   stockAlert: 10 },
        ],
      },
    ],
  },

  // ── 6. BIJOUX ─────────────────────────────────────────────────────────────
  {
    id: "bijoux",
    label: "Bijouterie",
    emoji: "💍",
    description: "Or, argent, fantaisie, montres...",
    categories: [
      {
        name: "Or",
        products: [
          { name: "Collier or 18 carats",    unit: "pièce", buyPrice: 800000,  sellPrice: 1200000, stockAlert: 1 },
          { name: "Bracelet or 18 carats",   unit: "pièce", buyPrice: 600000,  sellPrice: 950000,  stockAlert: 1 },
          { name: "Bague or 18 carats",      unit: "pièce", buyPrice: 350000,  sellPrice: 550000,  stockAlert: 2 },
          { name: "Boucles d'oreilles or",   unit: "pièce", buyPrice: 280000,  sellPrice: 450000,  stockAlert: 2 },
          { name: "Alliance or (la paire)",  unit: "paire", buyPrice: 500000,  sellPrice: 800000,  stockAlert: 1 },
        ],
      },
      {
        name: "Argent",
        products: [
          { name: "Collier argent 925",      unit: "pièce", buyPrice: 80000,  sellPrice: 130000, stockAlert: 2 },
          { name: "Bracelet argent 925",     unit: "pièce", buyPrice: 55000,  sellPrice: 90000,  stockAlert: 2 },
          { name: "Bague argent 925",        unit: "pièce", buyPrice: 35000,  sellPrice: 60000,  stockAlert: 3 },
          { name: "Boucles d'oreilles argent",unit: "pièce",buyPrice: 30000,  sellPrice: 50000,  stockAlert: 3 },
        ],
      },
      {
        name: "Bijoux fantaisie",
        products: [
          { name: "Collier fantaisie",       unit: "pièce", buyPrice: 8000,  sellPrice: 15000, stockAlert: 5 },
          { name: "Bracelet fantaisie",      unit: "pièce", buyPrice: 5000,  sellPrice: 10000, stockAlert: 5 },
          { name: "Bague fantaisie",         unit: "pièce", buyPrice: 4000,  sellPrice: 8000,  stockAlert: 5 },
          { name: "Boucles d'oreilles mode", unit: "pièce", buyPrice: 6000,  sellPrice: 12000, stockAlert: 5 },
          { name: "Chaîne cheville",         unit: "pièce", buyPrice: 5000,  sellPrice: 10000, stockAlert: 5 },
        ],
      },
      {
        name: "Montres",
        products: [
          { name: "Montre homme classique",  unit: "pièce", buyPrice: 120000, sellPrice: 200000, stockAlert: 2 },
          { name: "Montre femme élégante",   unit: "pièce", buyPrice: 100000, sellPrice: 170000, stockAlert: 2 },
          { name: "Montre sport",            unit: "pièce", buyPrice: 80000,  sellPrice: 130000, stockAlert: 2 },
          { name: "Montre enfant",           unit: "pièce", buyPrice: 30000,  sellPrice: 50000,  stockAlert: 3 },
        ],
      },
    ],
  },

  // ── 7. PHARMACIE / PARAPHARMACIE ──────────────────────────────────────────
  {
    id: "pharmacie",
    label: "Pharmacie / Parapharmacie",
    emoji: "💊",
    description: "Médicaments courants, cosmétiques, hygiène...",
    categories: [
      {
        name: "Médicaments courants",
        products: [
          { name: "Paracétamol 500mg (16 cp)", unit: "boîte",  buyPrice: 8000,  sellPrice: 10000, stockAlert: 10 },
          { name: "Amoxicilline 500mg",         unit: "boîte",  buyPrice: 18000, sellPrice: 22000, stockAlert: 5  },
          { name: "Ibuprofène 400mg",           unit: "boîte",  buyPrice: 15000, sellPrice: 18000, stockAlert: 5  },
          { name: "Vitamine C 500mg",           unit: "boîte",  buyPrice: 12000, sellPrice: 15000, stockAlert: 5  },
          { name: "Sirop toux adulte",          unit: "flacon", buyPrice: 18000, sellPrice: 22000, stockAlert: 5  },
          { name: "Pommade cicatrisante",       unit: "pot",    buyPrice: 12000, sellPrice: 16000, stockAlert: 5  },
          { name: "Sérum physiologique",        unit: "boîte",  buyPrice: 8000,  sellPrice: 10000, stockAlert: 5  },
        ],
      },
      {
        name: "Hygiène & Soin",
        products: [
          { name: "Gel hydroalcoolique 500ml",  unit: "flacon", buyPrice: 18000, sellPrice: 22000, stockAlert: 5 },
          { name: "Masques chirurgicaux (50)",  unit: "boîte",  buyPrice: 15000, sellPrice: 20000, stockAlert: 5 },
          { name: "Thermomètre digital",        unit: "pièce",  buyPrice: 35000, sellPrice: 45000, stockAlert: 3 },
          { name: "Coton hydrophile 100g",      unit: "sachet", buyPrice: 8000,  sellPrice: 10000, stockAlert: 5 },
          { name: "Bandes de gaze",             unit: "sachet", buyPrice: 5000,  sellPrice: 7000,  stockAlert: 5 },
        ],
      },
      {
        name: "Cosmétiques",
        products: [
          { name: "Crème visage éclaircissante",unit: "pot",    buyPrice: 25000, sellPrice: 38000, stockAlert: 5 },
          { name: "Lotion corps 400ml",         unit: "flacon", buyPrice: 22000, sellPrice: 32000, stockAlert: 5 },
          { name: "Shampooing 400ml",           unit: "flacon", buyPrice: 18000, sellPrice: 25000, stockAlert: 5 },
          { name: "Déodorant spray",            unit: "flacon", buyPrice: 20000, sellPrice: 28000, stockAlert: 5 },
          { name: "Savon dermatologique",       unit: "pièce",  buyPrice: 8000,  sellPrice: 12000, stockAlert: 10 },
          { name: "Huile de coco 200ml",        unit: "flacon", buyPrice: 18000, sellPrice: 25000, stockAlert: 5 },
        ],
      },
    ],
  },

  // ── 8. GÉNÉRAL ────────────────────────────────────────────────────────────
  {
    id: "general",
    label: "Commerce général",
    emoji: "🏪",
    description: "Catalogue vide — je configure mes produits manuellement",
    categories: [],
  },
];
