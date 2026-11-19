import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from '../api';
import { AuthContext } from './context';
import type { User } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, ask the server whether the browser's cookie is a valid session.
  useEffect(() => {
    let cancelled = false;

    api<User>('/api/auth/me')
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch((err) => {
        // 401 just means "not logged in"; anything else is a real problem
        if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    const u = await api<User>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setUser(u);
  }

  async function register(email: string, password: string) {
    const u = await api<User>('/api/auth/register', {
      method: 'POST',
      body: { email, password },
    });
    setUser(u);
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}