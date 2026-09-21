'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function RailNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (pathname === '/login' || pathname === '/signup') return null;
  // The end-user session window is a standalone page for someone who isn't an
  // operator — never show them the operator's navigation, even if they happen
  // to be signed in on the same browser.
  if (pathname?.startsWith('/session/')) return null;
  if (!user) return null;

  const isWorkflows = pathname?.startsWith('/workflows');
  const isSessions = pathname?.startsWith('/sessions');

  return (
    <nav className="w-16 shrink-0 border-r border-ink-line bg-ink-panel flex flex-col items-center py-4 gap-6">
      <Link
        href="/workflows"
        className="w-8 h-8 rounded-md bg-signal/15 border border-signal/40 flex items-center justify-center"
        title="AutoFlow"
      >
        <span className="w-2 h-2 rounded-full bg-signal pulse-soft" />
      </Link>

      <div className="flex flex-col gap-1 mt-2">
        <NavItem href="/workflows" label="Workflows" active={!!isWorkflows}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="5" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="19" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7 7 L17 11.2M7 17 L17 12.8" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </NavItem>
        <NavItem href="/sessions" label="Sessions" active={!!isSessions}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="12" cy="10.5" r="1.6" fill="currentColor" />
          </svg>
        </NavItem>
      </div>

      <div className="mt-auto flex flex-col items-center gap-2">
        <div
          className="w-7 h-7 rounded-full bg-ink-raised border border-ink-line flex items-center justify-center text-[10px] font-mono text-text-muted"
          title={user.email}
        >
          {user.email.slice(0, 2).toUpperCase()}
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="text-text-dim hover:text-danger transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </nav>
  );
}

function NavItem({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
        active
          ? 'bg-signal/15 text-signal border border-signal/30'
          : 'text-text-muted hover:text-text-primary hover:bg-ink-raised border border-transparent'
      }`}
    >
      {children}
    </Link>
  );
}
