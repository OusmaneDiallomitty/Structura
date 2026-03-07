'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

/**
 * Bannière affichée quand un Super Admin impersonne un directeur.
 * Détecte la clé 'structura_impersonated' en sessionStorage.
 */
export default function ImpersonationBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(sessionStorage.getItem('structura_impersonated') === '1');
  }, []);

  if (!active) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2
                    bg-amber-500 text-white text-sm font-semibold py-2 px-4 shadow-md">
      <ShieldAlert className="w-4 h-4" />
      Session d'impersonation active — vous agissez en tant que directeur de cette école.
      Ce token expire dans 15 minutes.
    </div>
  );
}
