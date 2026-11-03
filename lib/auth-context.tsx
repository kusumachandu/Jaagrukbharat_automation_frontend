'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, setToken, clearToken, setReadOnly, ApiError } from './api';

export type Role = 'super_admin' | 'user' | 'observer';

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin',
  user: 'User',
  observer: 'Observer',
};

interface AuthUser {
  userId: string;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** Observers can look at everything but change nothing. */
  readOnly: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Resolves with a message when the account must be approved first (no sign-in happens), else nothing. */
  signup: (email: string, password: string) => Promise<string | void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface SignedIn {
  accessToken: string;
  userId: string;
  email: string;
  role: Role;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  function setUser(next: AuthUser | null) {
    setReadOnly(next?.role === 'observer');
    setUserState(next);
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signIn(res: SignedIn) {
    setToken(res.accessToken);
    setUser({ userId: res.userId, email: res.email, role: res.role });
    router.push('/workflows');
  }

  async function login(email: string, password: string) {
    signIn(await api.post<SignedIn>('/auth/login', { email, password }));
  }

  async function signup(email: string, password: string) {
    const res = await api.post<SignedIn | { status: 'pending'; message: string }>('/auth/signup', {
      email,
      password,
    });
    if ('accessToken' in res) return signIn(res);
    return res.message;
  }

  function logout() {
    clearToken();
    setUser(null);
    router.push('/login');
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        readOnly: user?.role === 'observer',
        isSuperAdmin: user?.role === 'super_admin',
        login,
        signup,
        logout,
      }}
    >
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
