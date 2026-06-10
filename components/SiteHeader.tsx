'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

interface SiteHeaderProps {
  /** Right-side content: status badge, page-specific links, etc. */
  right?: ReactNode;
  /** Optional subtitle shown after the "/" separator (e.g. "Toronto City Council") */
  subtitle?: string;
  /** Set to false to hide the persistent site nav (e.g. on the admin page) */
  showNav?: boolean;
}

// Persistent nav links shown on every page — add new pages here (e.g. "About").
const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/archive', label: 'Archive' },
  { href: '/search', label: 'Search' },
];

export default function SiteHeader({ right, subtitle = 'Toronto City Council', showNav = true }: SiteHeaderProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-brand-blue sticky top-0 z-20">
      <div
        className="flex items-center justify-between px-4 sm:px-8"
        style={{ height: '64px' }}
      >
        {/* Left: logo + wordmark + optional session subtitle */}
        <a href="/" className="flex items-center gap-3 no-underline min-w-0">
          {/* Logo mark */}
          <Image
            src="/chw-logo.png"
            alt="City Hall Watcher"
            width={30}
            height={30}
            className="flex-shrink-0"
            style={{ borderRadius: '6.6px' }}
          />

          {/* Wordmark row */}
          <div className="flex items-baseline gap-2 min-w-0">
            {/* "City Hall Watcher" */}
            <span
              className="text-white leading-none flex-shrink-0 text-[15px] sm:text-[18px]"
              style={{
                fontFamily: 'var(--font-schibsted)',
                fontWeight: 800,
                letterSpacing: '-0.18px',
              }}
            >
              City Hall Watcher
            </span>

            {/* "LIVE" brand label — hidden on mobile to avoid colliding with the right-side status badge */}
            <span
              className="hidden sm:inline text-white flex-shrink-0"
              style={{
                fontFamily: 'var(--font-plex)',
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '1.68px',
                background: 'rgba(255,255,255,0.16)',
                borderRadius: '4px',
                padding: '2px 7px',
                lineHeight: 1,
              }}
            >
              LIVE
            </span>

            {/* Session subtitle — hidden on small screens to avoid badge overlap */}
            {subtitle && (
              <span className="hidden sm:flex items-baseline gap-1.5 min-w-0 truncate">
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: 400 }}>
                  /
                </span>
                <span
                  className="truncate"
                  style={{
                    fontFamily: 'var(--font-hanken)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.78)',
                  }}
                >
                  {subtitle}
                </span>
              </span>
            )}
          </div>
        </a>

        {/* Right: persistent nav (desktop) + page-specific content + mobile menu toggle */}
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {showNav && (
            <nav className="hidden sm:flex items-center gap-5">
              {NAV_LINKS.map(link => {
                const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    className="transition-colors hover:text-white"
                    style={{
                      fontFamily: 'var(--font-hanken)',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: active ? 'rgb(255,255,255)' : 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {link.label}
                  </a>
                );
              })}
            </nav>
          )}

          {right}

          {showNav && (
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              className="sm:hidden flex items-center justify-center text-white/80 hover:text-white transition-colors"
              style={{ width: '28px', height: '28px', flexShrink: 0 }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                {menuOpen ? (
                  <path d="M3 3 L15 15 M15 3 L3 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                ) : (
                  <>
                    <path d="M2 4.5 H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M2 9 H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M2 13.5 H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </>
                )}
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Mobile dropdown nav */}
      {showNav && menuOpen && (
        <nav
          className="sm:hidden flex flex-col"
          style={{ background: 'rgb(22, 38, 79)', padding: '6px 16px 10px' }}
        >
          {NAV_LINKS.map(link => {
            const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-white"
                style={{
                  fontFamily: 'var(--font-hanken)',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: active ? 'rgb(255,255,255)' : 'rgba(255,255,255,0.7)',
                  padding: '10px 0',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {link.label}
              </a>
            );
          })}
        </nav>
      )}
    </header>
  );
}
