'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, setToken, clearToken, ApiError } from './api';

interface AuthUser {
  userId: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ accessToken: string; userId: string; email: string }>(
      '/auth/login',
      { email, password },
    );
    setToken(res.accessToken);
    setUser({ userId: res.userId, email: res.email });
    router.push('/workflows');
  }

  async function signup(email: string, password: string) {
    const res = await api.post<{ accessToken: string; userId: string; email: string }>(
      '/auth/signup',
      { email, password },
    );
    setToken(res.accessToken);
    setUser({ userId: res.userId, email: res.email });
    router.push('/workflows');
  }

  function logout() {
    clearToken();
    setUser(null);
    router.push('/login');
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
