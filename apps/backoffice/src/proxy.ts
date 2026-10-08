import { type NextRequest, NextResponse } from 'next/server';

/**
 * Contrôle rapide : sans cookie de session, toute page renvoie vers la connexion.
 * La vraie vérification (session valide, rôle) est faite par le serveur AfriSime à chaque appel.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has('afs_admin')) {
    const url = new URL('/login', request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Tout sauf la connexion, les fichiers de Next.js et les images publiques.
  matcher: ['/((?!login|_next/|favicon.ico|logo.webp).*)'],
};
