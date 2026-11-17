import { PIXEL, rateKey, rateLimited, recordOpen } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

/**
 * The tracking pixel.
 *
 * Always returns the image, whatever happens — including for an invalid token
 * or a rate-limited caller. A pixel that 404s tells an attacker, or a curious
 * recipient, which tokens are real.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  if (!rateLimited(rateKey(req))) {
    try {
      await recordOpen(token, req);
    } catch {
      // Telemetry must never break the response. A dropped event is a worse
      // metric; a 500 here is a visible broken image in someone's mail client.
    }
  }

  return new Response(new Uint8Array(PIXEL), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.byteLength),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  });
}
