import { NextResponse, type NextRequest } from 'next/server';

/**
 * Nonce-based CSP for the console. Same reasoning as the simulation surface,
 * with two differences:
 *   form-action 'self'   — admin forms legitimately post back here.
 *   connect-src 'self'   — nothing on this origin talks to anywhere else.
 *
 * Template previews in the Studio render inside a sandboxed iframe, so
 * frame-src allows 'self' here where the simulation surface forbids frames
 * entirely.
 */
export function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const dev = process.env.NODE_ENV !== 'production';

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
