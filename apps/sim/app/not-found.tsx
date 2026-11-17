import { BRAND } from '@chetna/core';

/**
 * Shown for an unknown, expired or malformed token.
 *
 * Deliberately says nothing about WHY. A page that distinguishes "no such
 * token" from "that token is real but the message has not been sent yet" hands
 * anyone probing the surface an oracle for enumerating valid tokens.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 text-center">
      <h1 className="text-lg font-semibold text-white">This link is no longer active</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">
        It may have expired, or it may never have been valid. Nothing has been recorded.
      </p>
      <p className="mt-6 text-xs text-slate-600">
        {BRAND.name} — authorized security awareness simulation. No credentials are requested or
        collected on this site.
      </p>
    </main>
  );
}
