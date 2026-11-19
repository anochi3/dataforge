import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth/context';

type Mode = 'login' | 'register';

export function AuthPage({ mode }: { mode: Mode }) {
  const { user, login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already logged in (including right after a successful submit): go to the dashboard.
  if (user) return <Navigate to="/" replace />;

  const isLogin = mode === 'login';

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isLogin) await login(email, password);
      else await register(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-card">
      <h1>{isLogin ? 'Log in to DataForge' : 'Create your account'}</h1>

      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            minLength={isLogin ? undefined : 8}
            required
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Please wait...' : isLogin ? 'Log in' : 'Register'}
        </button>
      </form>

      <p className="switch">
        {isLogin ? (
          <>
            No account yet? <Link to="/register">Register</Link>
          </>
        ) : (
          <>
            Already registered? <Link to="/login">Log in</Link>
          </>
        )}
      </p>
    </main>
  );
}