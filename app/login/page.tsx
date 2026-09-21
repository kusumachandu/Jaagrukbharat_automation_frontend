'use client';

import { AuthForm } from '@/components/AuthForm';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { login } = useAuth();
  return <AuthForm mode="login" onSubmit={login} />;
}
