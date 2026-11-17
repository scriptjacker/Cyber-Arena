import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content-Security-Policy with a per-request nonce.
 *
 * The naive way to make a React app work under CSP is to add 'unsafe-inline'
 * to script-src, which defeats most of the point of having a CSP at all. This
 * instead mints a nonce per request and hands it to Next through the request
 * header, so framework scripts are allowed by nonce and nothing else is.
 *
 * The directives that matter on THIS app:
 *   form-action 'none'  — there is nowhere for any form to submit, which is the
 *                         last line of the non-collection guarantee. Even if a
 *                         field somehow existed, the browser would refuse to
 *                         send it.
 *   connect-src 'self'  — telemetry can only reach this origin.
 *   img-src 'self' data: — simulated emails use inline images, never remote
 *                         ones, so no third party learns a message was opened.
 *
 * style-src keeps 'unsafe-inline' deliberately: the simulated email bodies we
 * replay carry inline `style` attributes, which is how real HTML email works.
 * That is a styling channel, not a scripting one.
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
    "form-action 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
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
