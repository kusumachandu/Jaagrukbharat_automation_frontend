'use client';

import { AuthForm } from '@/components/AuthForm';
import { useAuth } from '@/lib/auth-context';

export default function SignupPage() {
  const { signup } = useAuth();
  return <AuthForm mode="signup" onSubmit={signup} />;
}
