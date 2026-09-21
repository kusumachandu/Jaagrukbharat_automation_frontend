'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/auth-context';

interface AuthFormProps {
  mode: 'login' | 'signup';
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <span className="w-2 h-2 rounded-full bg-signal pulse-soft" />
          <span className="font-display font-semibold tracking-wide text-text-primary">
            AUTOFLOW
          </span>
        </div>

        <div className="bg-ink-panel border border-ink-line rounded-lg shadow-panel p-6">
          <h1 className="font-display text-lg font-semibold mb-1">
            {mode === 'login' ? 'Sign in' : 'Create an account'}
          </h1>
          <p className="text-text-muted text-sm mb-6">
            {mode === 'login'
              ? 'Access your workflows and live runs.'
              : 'Takes a few seconds — no card required.'}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Email">
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@example.com"
                className="input"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </Field>

            {error && (
              <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-md bg-signal text-ink font-semibold py-2.5 text-sm hover:bg-signal-glow transition-colors disabled:opacity-50"
            >
              {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-text-muted text-sm mt-4">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <Link href="/signup" className="text-signal hover:underline">
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link href="/login" className="text-signal hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-mono uppercase tracking-wider text-text-dim">{label}</span>
      {children}
    </label>
  );
}
