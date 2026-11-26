'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SiteHeader from './SiteHeader';

// Shared frame for the /admin pages: checks the session cookie, shows the
// login form when it's missing, and renders the admin sub-nav. Children only
// mount once the user is signed in, so they can fetch admin data on mount.

type AdminState = 'checking' | 'login' | 'admin';

const ADMIN_NAV: { href: string; label: string; isActive: (path: string) => boolean }[] = [
  { href: '/admin', label: 'Dashboard', isActive: p => p === '/admin' },
  { href: '/admin/threads', label: 'Threads', isActive: p => p.startsWith('/admin/threads') },
  // Per-session tagging lives at /admin/<slug>/votes, so it counts as Vote tagger too.
  { href: '/admin/vote-tagger', label: 'Vote tagger', isActive: p => p.startsWith('/admin/vote-tagger') || /^\/admin\/[^/]+\/votes/.test(p) },
  { href: '/admin/tools', label: 'Import & tools', isActive: p => p.startsWith('/admin/tools') },
];

// The vote-tagger pages hold wider tables and vote cards than the dashboard.
const WIDTHS = { narrow: 'max-w-[560px]', wide: 'max-w-3xl' } as const;

export const adminCard =
  'bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-5';
export const adminCardLabel = 'text-xs font-medium text-[#888] uppercase tracking-wide';

export default function AdminShell({ children, width = 'narrow' }: { children: ReactNode; width?: keyof typeof WIDTHS }) {
  const pathname = usePathname();
  const [adminState, setAdminState] = useState<AdminState>('checking');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth')
      .then(r => setAdminState(r.ok ? 'admin' : 'login'))
      .catch(() => setAdminState('login'));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        setLoginError(r.status === 429 ? 'Too many failed attempts — try again in 15 minutes.' : 'Incorrect password.');
      } else {
        setPassword('');
        setAdminState('admin');
      }
    } catch {
      setLoginError('Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' });
    setAdminState('login');
  }

  if (adminState === 'checking') {
    return (
      <div className="min-h-screen bg-[#f5f5f0] dark:bg-[#111] flex items-center justify-center">
        <p className="text-sm text-[#999] dark:text-[#555]">Loading…</p>
      </div>
    );
  }

  if (adminState === 'login') {
    return (
      <div className="min-h-screen bg-[#f5f5f0] dark:bg-[#111] flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-8">
          <h1 className="text-sm font-semibold text-[#1a1a1a] dark:text-[#e8e8e0] mb-1">CHW Live Admin</h1>
          <p className="text-xs text-[#888] mb-6">Enter your password to continue.</p>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="text-sm px-3 py-2 border border-[#d0d0c8] dark:border-[#333] rounded-lg bg-[#fafaf8] dark:bg-[#111] text-[#1a1a1a] dark:text-[#e8e8e0] placeholder-[#aaa] outline-none focus:border-[#888] dark:focus:border-[#666] transition-colors"
            />
            {loginError && <p className="text-xs text-[#c0392b] dark:text-[#f08080]">{loginError}</p>}
            <button
              type="submit"
              disabled={loading}
              className="text-sm font-medium py-2 rounded-lg bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] dark:hover:bg-white transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const headerRight = (
    <div className="flex items-center gap-4">
      <Link href="/" className="text-xs text-white/60 hover:text-white transition-colors">
        Public view →
      </Link>
      <button
        onClick={handleLogout}
        className="text-xs text-white/60 hover:text-white transition-colors bg-none border-none cursor-pointer p-0"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader right={headerRight} showNav={false} />

      <nav className="border-b border-[#e0e0d8] dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a]">
        <div className={`${WIDTHS[width]} mx-auto px-4 flex gap-5 overflow-x-auto`}>
          {ADMIN_NAV.map(item => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-xs py-3 border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  active
                    ? 'border-[#1a1a1a] dark:border-[#e8e8e0] text-[#1a1a1a] dark:text-[#e8e8e0] font-medium'
                    : 'border-transparent text-[#888] hover:text-[#333] dark:hover:text-[#ccc]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className={`${WIDTHS[width]} mx-auto px-4 py-8 flex flex-col gap-5`}>
        {children}
      </main>
    </div>
  );
}
