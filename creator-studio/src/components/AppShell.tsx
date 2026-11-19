'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Clapperboard,
  FolderOpen,
  Home,
  ImageIcon,
  LayoutTemplate,
  Menu,
  Search,
  Settings,
  Sparkles,
  Tv,
  WifiOff,
  Film,
} from 'lucide-react';
import { useOnline, useSettings } from '@/hooks/data';
import { requestPersistentStorage } from '@/services/storage/db';
import { useFeedback } from './feedback';
import { Sheet, cn } from './ui';

export const NAV = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/create', label: 'Create Video', icon: Sparkles },
  { href: '/images', label: 'AI Image Studio', icon: ImageIcon },
  { href: '/thumbnails', label: 'Thumbnail Studio', icon: LayoutTemplate },
  { href: '/editor', label: 'Video Editor', icon: Film },
  { href: '/seo', label: 'SEO Studio', icon: Search },
  { href: '/projects', label: 'My Projects', icon: FolderOpen },
  { href: '/channels', label: 'Channel Manager', icon: Tv },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

const MOBILE = ['/', '/create', '/projects', '/editor'];

function useServiceWorker() {
  const { toast } = useFeedback();
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        const offer = (w: ServiceWorker) =>
          toast('A new version of Creator Studio is ready.', 'info', { label: 'Update', run: () => w.postMessage({ type: 'SKIP_WAITING' }) });
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
          });
        });
        setInterval(() => reg.update().catch(() => {}), 30 * 60_000);
      })
      .catch((err) => console.warn('SW registration failed', err));
  }, [toast]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const online = useOnline();
  const [more, setMore] = useState(false);
  const { settings } = useSettings();
  useServiceWorker();

  useEffect(() => {
    const theme = settings?.theme ?? 'dark';
    const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
    document.documentElement.dataset.theme = resolved;
  }, [settings?.theme]);

  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <div className="bg-studio min-h-dvh">
      <aside className="pt-safe fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/70 px-3 backdrop-blur-xl lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-3 py-5">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white">
            <Clapperboard className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg tracking-wide">CREATOR STUDIO</div>
            <div className="text-[11px] font-bold tracking-[0.3em] text-accent">AI</div>
          </div>
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn('flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition', active(n.href) ? 'bg-accent/15 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink')}
            >
              <n.icon className={cn('size-5', active(n.href) && 'text-accent')} />
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>

      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-white">
              <Clapperboard className="size-4" />
            </div>
            <span className="font-display tracking-wide">CREATOR STUDIO <span className="text-accent">AI</span></span>
          </Link>
          {!online && (
            <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-bold text-warning">
              <WifiOff className="size-3.5" /> Offline
            </span>
          )}
        </div>
      </header>
      {!online && (
        <div className="hidden bg-warning/15 px-4 py-2 text-center text-sm font-semibold text-warning lg:ml-64 lg:block">
          You are offline. Projects, editing and on-device rendering still work; AI generation needs a connection.
        </div>
      )}

      <main className="pl-safe pr-safe mx-auto w-full max-w-6xl px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-5 lg:pb-12 lg:pl-[calc(16rem+2rem)] lg:pr-8">{children}</main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl lg:hidden" aria-label="Main">
        <div className="grid h-16 grid-cols-5">
          {NAV.filter((n) => MOBILE.includes(n.href)).map((n) => (
            <Link key={n.href} href={n.href} className={cn('flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active(n.href) ? 'text-accent' : 'text-muted')}>
              {n.href === '/create' ? (
                <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/30">
                  <n.icon className="size-5" />
                </span>
              ) : (
                <n.icon className="size-6" />
              )}
              {n.href !== '/create' && n.label.split(' ')[n.label.startsWith('My') ? 1 : 0]}
            </Link>
          ))}
          <button onClick={() => setMore(true)} className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted">
            <Menu className="size-6" />
            More
          </button>
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="Studio">
        <div className="grid grid-cols-2 gap-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setMore(false)}
              className={cn('flex min-h-16 items-center gap-3 rounded-2xl border border-line p-3 text-sm font-semibold', active(n.href) ? 'bg-accent/15' : 'bg-surface-2')}
            >
              <n.icon className="size-5 text-accent" />
              {n.label}
            </Link>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
