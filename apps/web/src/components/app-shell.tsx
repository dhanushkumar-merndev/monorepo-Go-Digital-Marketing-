'use client';

import { Badge } from '@gdm/ui/components/badge';
import { Button } from '@gdm/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@gdm/ui/components/dialog';
import { Separator } from '@gdm/ui/components/separator';
import { StatusBadge } from '@gdm/ui/components/status-badge';
import {
  CarFront,
  Home,
  Laptop2,
  ListChecks,
  LoaderCircle,
  LogOut,
  Menu,
  Settings2,
  PhoneCall,
  MessagesSquare,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { hasPermission } from '@/features/auth/auth-types';
import {
  SupportElevationBanner,
  SupportElevationControl,
} from '@/features/tenancy/support-elevation';
import { TenantSelector } from '@/features/tenancy/tenant-selector';

interface AppShellProps {
  children: ReactNode;
}

const navigation = [
  { href: '/', icon: Home, label: 'Overview' },
  { href: '/leads', icon: ListChecks, label: 'Leads', permission: 'leads.read' },
  { href: '/telephony', icon: PhoneCall, label: 'Calling', permission: 'telephony.calls.read' },
  {
    href: '/inbox',
    icon: MessagesSquare,
    label: 'Inbox',
    permission: 'messaging.conversations.read',
  },
  { href: '/profile', icon: UserRound, label: 'Profile', permission: 'account.profile.read' },
  {
    href: '/sessions',
    icon: Laptop2,
    label: 'Active sessions',
    permission: 'account.sessions.read',
  },
  {
    href: '/administration',
    icon: Settings2,
    label: 'Administration',
    permission: 'organization.clients.read',
  },
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-xl shadow-[var(--shadow-sm)]"
      >
        <CarFront className="size-5" strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">Go Digital</span>
        <span className="text-muted-foreground block truncate text-xs">Automobile CRM</span>
      </span>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const auth = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const session = auth.session;

  if (session === null || session.currentMembership === null) return null;

  async function logout() {
    setLoggingOut(true);
    try {
      await auth.logout();
    } catch {
      // AuthProvider still clears local credentials and returns to sign-in.
    } finally {
      setLoggingOut(false);
    }
  }

  const membership = session.currentMembership;

  return (
    <div className="min-h-screen bg-[var(--canvas)] md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        className="bg-background sr-only z-[80] rounded-md px-4 py-2 text-sm font-medium shadow-md focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        href="#main-content"
      >
        Skip to main content
      </a>

      <aside className="hidden min-h-screen border-e border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] md:sticky md:top-0 md:flex md:h-screen md:flex-col">
        <div className="border-b border-[var(--sidebar-border)] px-5 py-5">
          <Brand />
        </div>
        <div className="border-b border-[var(--sidebar-border)] p-4">
          <TenantSelector />
        </div>
        <nav aria-label="Primary navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <NavigationLinks onNavigate={() => undefined} pathname={pathname} />
          <SupportElevationControl />
        </nav>
        <div className="border-t border-[var(--sidebar-border)] p-4">
          <UserSummary />
          <Button
            className="mt-3 w-full justify-start text-[var(--sidebar-foreground)] hover:bg-white/10 hover:text-white"
            disabled={loggingOut}
            onClick={() => void logout()}
            variant="ghost"
          >
            {loggingOut ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            ) : (
              <LogOut aria-hidden="true" data-icon="inline-start" />
            )}
            {loggingOut ? 'Signing out' : 'Sign out'}
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 border-b shadow-[var(--shadow-xs)] backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="md:hidden">
              <Brand />
            </div>
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-semibold">{membership.clientOrganization.name}</p>
              <p className="text-muted-foreground truncate text-xs">{membership.roleName}</p>
            </div>
            <div className="flex items-center gap-2">
              {session.supportElevation === null ? (
                <StatusBadge tone="success">Standard access</StatusBadge>
              ) : (
                <StatusBadge tone="warning">Support elevated</StatusBadge>
              )}
              <Dialog onOpenChange={setMobileOpen} open={mobileOpen}>
                <DialogTrigger
                  aria-label="Open navigation"
                  className="border-border hover:bg-muted grid size-10 place-items-center rounded-md border md:hidden"
                >
                  <Menu aria-hidden="true" className="size-5" />
                </DialogTrigger>
                <DialogContent side="right">
                  <DialogHeader>
                    <DialogTitle>Navigation</DialogTitle>
                    <DialogDescription>Signed in as {session.user.displayName}.</DialogDescription>
                  </DialogHeader>
                  <div className="mt-6">
                    <TenantSelector presentation="full" />
                  </div>
                  <Separator className="my-5" />
                  <nav aria-label="Mobile navigation" className="space-y-1">
                    <NavigationLinks onNavigate={() => setMobileOpen(false)} pathname={pathname} />
                    <SupportElevationControl />
                  </nav>
                  <div className="mt-auto pt-6">
                    <Separator className="mb-5" />
                    <UserSummary />
                    <Button
                      className="mt-3 w-full justify-start"
                      disabled={loggingOut}
                      onClick={() => void logout()}
                      variant="outline"
                    >
                      {loggingOut ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      ) : (
                        <LogOut aria-hidden="true" data-icon="inline-start" />
                      )}
                      {loggingOut ? 'Signing out' : 'Sign out'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </header>

        <SupportElevationBanner />

        <main className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavigationLinks({ onNavigate, pathname }: { onNavigate(): void; pathname: string }) {
  const session = useAuth().session;
  return navigation.map((item) => {
    if ('permission' in item && (session === null || !hasPermission(session, item.permission))) {
      return null;
    }
    const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        aria-current={active ? 'page' : undefined}
        className={
          active
            ? 'flex min-h-10 items-center gap-3 rounded-lg bg-[var(--sidebar-active)] px-3 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70'
            : 'flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[var(--sidebar-muted)] transition-colors outline-none hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70'
        }
        href={item.href}
        key={item.href}
        onClick={onNavigate}
      >
        <Icon aria-hidden="true" className="size-4" />
        {item.label}
      </Link>
    );
  });
}

function UserSummary() {
  const session = useAuth().session;
  if (session === null || session.currentMembership === null) return null;
  const initials = session.user.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-white/12 text-xs font-semibold text-white"
      >
        {initials || 'U'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{session.user.displayName}</p>
        <p className="truncate text-xs text-[var(--sidebar-muted)]">{session.user.email}</p>
      </div>
      <Badge className="max-w-24 truncate" variant="outline">
        {session.currentMembership.roleName}
      </Badge>
    </div>
  );
}
