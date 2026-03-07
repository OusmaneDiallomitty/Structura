import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware Next.js — protection des routes du dashboard admin.
 *
 * Stratégie : les tokens sont en localStorage (client-side).
 * Ce middleware protège contre la navigation directe vers les pages
 * protégées en vérifiant un cookie de session posé lors du login.
 *
 * Note : la validation complète du JWT se fait côté client dans
 * dashboard/layout.tsx (isTokenExpired + isSuperAdmin).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Routes publiques — pas de vérification
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Vérifier le cookie de session admin (posé à la connexion)
  const sessionCookie = request.cookies.get('structura_admin_session');

  if (pathname.startsWith('/dashboard') && !sessionCookie) {
    // Rediriger vers login en gardant l'URL d'origine
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
