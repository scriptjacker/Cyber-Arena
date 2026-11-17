'use client';

import { useActionState } from 'react';
import { login, type LoginState } from '@/lib/actions/auth';

/**
 * The sign-in form.
 *
 * This is the one place in the whole product that legitimately handles a
 * password: a staff member authenticating to the admin console. It is also the
 * clearest illustration of the distinction the product rests on — the console
 * has a password field because people sign in to it, and the simulation surface
 * has none because nobody should ever sign in there.
 */
export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="rounded-xl border border-ink-line bg-ink-soft p-6">
      <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue="security@nimbus.test"
          className="mt-1.5 w-full rounded-lg border border-ink-line bg-ink px-3 py-2.5 font-normal normal-case tracking-normal text-slate-100 outline-none focus:border-accent"
        />
      </label>

      <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5 w-full rounded-lg border border-ink-line bg-ink px-3 py-2.5 font-normal normal-case tracking-normal text-slate-100 outline-none focus:border-accent"
        />
      </label>

      {state.error && (
        <p className="mt-4 rounded-lg border border-accent-bad/40 bg-accent-bad/10 px-3 py-2 text-sm text-accent-bad">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/85 disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
