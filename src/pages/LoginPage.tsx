import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NeuralBackground } from '../components/NeuralBackground';

/* ─── Google Icon ─── */
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const LoginPage: React.FC = () => {
  const { signInWithGoogle, user, loading } = useAuth();

  /* Already authenticated → go to app */
  if (!loading && user) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center text-white">
      <NeuralBackground />

      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight">Sign in to Cognivault</h1>
            <p className="text-center text-sm text-zinc-500">
              Build your cognitive map and understand your understanding.
            </p>
          </div>

          {/* Divider */}
          <div className="mb-6 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Google sign-in button */}
          <button
            onClick={signInWithGoogle}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-zinc-800 shadow-sm transition-all hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-50"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Subtle note */}
          <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-600">
            By continuing, you agree to Cognivault's Terms of Service and Privacy Policy.
          </p>
        </div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <a href="/" className="text-xs text-zinc-500 transition-colors hover:text-indigo-400">
            ← Back to home
          </a>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
