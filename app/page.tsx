'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/workflows' : '/login');
  }, [loading, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-text-muted font-mono text-sm">
      booting…
    </div>
  );
}
