import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-7xl font-bold text-brand-600">404</p>
      <h1 className="text-xl font-semibold text-gray-900">Page introuvable</h1>
      <p className="text-sm text-gray-500">Cette page n'existe pas dans le panneau admin.</p>
      <Link
        href="/dashboard"
        className="mt-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-xl
                   hover:bg-brand-700 transition"
      >
        Retour au tableau de bord
      </Link>
    </div>
  );
}
