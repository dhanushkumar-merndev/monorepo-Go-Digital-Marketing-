'use client';

import { Badge } from '@gdm/ui/components/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gdm/ui/components/dropdown-menu';
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
  Home,
  ListChecks,
  LoaderCircle,
  LogOut,
  Menu,
  Settings2,
  PhoneCall,
  MessagesSquare,
  MapPinned,
  Warehouse,
  ReceiptText,
  Truck,
  FileBadge2,
  BellRing,
  ChartNoAxesCombined,
  ScrollText,
  EllipsisVertical,
  PlugZap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import {
  AccountSettingsDialog,
  type AccountSettingsSection,
} from '@/features/auth/account-settings-dialog';
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
  {
    href: '/leads',
    icon: ListChecks,
    label: 'Leads',
    permission: 'leads.read',
    clientOperational: true,
  },
  {
    href: '/telephony',
    icon: PhoneCall,
    label: 'Calling',
    permission: 'telephony.calls.read',
    clientOperational: true,
  },
  {
    href: '/inbox',
    icon: MessagesSquare,
    label: 'Inbox',
    permission: 'messaging.conversations.read',
    clientOperational: true,
  },
  {
    href: '/test-rides',
    icon: MapPinned,
    label: 'Test rides',
    permission: 'test_rides.read',
    clientOperational: true,
  },
  {
    href: '/inventory',
    icon: Warehouse,
    label: 'Inventory',
    permission: 'inventory.units.read',
    clientOperational: true,
  },
  {
    href: '/bookings',
    icon: ReceiptText,
    label: 'Bookings',
    permission: 'commercial.bookings.read',
    clientOperational: true,
  },
  {
    href: '/deliveries',
    icon: Truck,
    label: 'Deliveries',
    permission: 'delivery.jobs.read',
    clientOperational: true,
  },
  {
    href: '/registrations',
    icon: FileBadge2,
    label: 'Registration & RC',
    permission: 'registration.cases.read',
    clientOperational: true,
  },
  {
    href: '/reminders',
    icon: BellRing,
    label: 'Post-sale reminders',
    permission: 'reminders.read',
    clientOperational: true,
  },
  {
    href: '/analytics',
    icon: ChartNoAxesCombined,
    label: 'Analytics',
  },
  {
    href: '/reports',
    icon: ScrollText,
    label: 'Audit & exports',
    permission: 'reports.read',
    clientOperational: true,
  },
  {
    href: '/integrations',
    icon: PlugZap,
    label: 'Integrations',
    permission: 'integrations.read',
    clientOperational: true,
  },
  {
    href: '/administration',
    icon: Settings2,
    label: 'Administration',
    permission: 'organization.clients.read',
  },
] as const;

const avatarTones = [
  'bg-sky-600 text-white',
  'bg-violet-600 text-white',
  'bg-emerald-600 text-white',
  'bg-rose-600 text-white',
  'bg-amber-600 text-white',
  'bg-cyan-700 text-white',
] as const;

function avatarTone(seed: string): (typeof avatarTones)[number] {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) | 0;
  return avatarTones[Math.abs(hash) % avatarTones.length] ?? avatarTones[0];
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-[var(--shadow-sm)]">
        <Image
          alt="Go Digital Marketing logo"
          className="size-10 object-cover"
          height={40}
          priority
          src="/logo.png"
          width={40}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm leading-5 font-semibold">Go Digital Marketing</span>
        <span className="text-muted-foreground block truncate text-xs">Agency platform</span>
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
  const platformOnly = membership.roleCode === 'AGENCY_ADMIN' && session.supportElevation === null;
  const workspaceName =
    session.supportElevation?.clientOrganization.name ??
    (platformOnly ? 'Platform workspace' : membership.clientOrganization.name);
  const workspaceLabel =
    session.supportElevation === null
      ? platformOnly
        ? 'Platform access'
        : membership.roleName
      : 'Temporary support access';

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
          <WorkspaceContext />
        </div>
        <nav
          aria-label="Primary navigation"
          className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
          data-scrollbar="sidebar"
        >
          <NavigationLinks onNavigate={() => undefined} pathname={pathname} />
          <SupportElevationControl />
        </nav>
        <div className="border-t border-[var(--sidebar-border)] p-4">
          <UserSummary loggingOut={loggingOut} onLogout={() => void logout()} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 border-b shadow-[var(--shadow-xs)] backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="md:hidden">
              <Brand />
            </div>
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-semibold">{workspaceName}</p>
              <p className="text-muted-foreground truncate text-xs">{workspaceLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              {session.supportElevation === null ? (
                <StatusBadge tone="success">
                  {session.currentMembership.roleCode === 'AGENCY_ADMIN'
                    ? 'Agency mode'
                    : 'Client access'}
                </StatusBadge>
              ) : (
                <StatusBadge tone="warning">Client support active</StatusBadge>
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
                    <WorkspaceContext presentation="full" />
                  </div>
                  <Separator className="my-5" />
                  <nav aria-label="Mobile navigation" className="space-y-1">
                    <NavigationLinks onNavigate={() => setMobileOpen(false)} pathname={pathname} />
                    <SupportElevationControl />
                  </nav>
                  <div className="mt-auto pt-6">
                    <Separator className="mb-5" />
                    <UserSummary loggingOut={loggingOut} onLogout={() => void logout()} />
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
  const platformOnly =
    session?.currentMembership?.roleCode === 'AGENCY_ADMIN' && session.supportElevation === null;
  return navigation.map((item) => {
    if ('permission' in item && (session === null || !hasPermission(session, item.permission))) {
      return null;
    }
    if ('clientOperational' in item && item.clientOperational && platformOnly) return null;
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

function WorkspaceContext({ presentation = 'compact' }: { presentation?: 'compact' | 'full' }) {
  const session = useAuth().session;
  if (session === null || session.currentMembership === null) return null;

  const support = session.supportElevation;
  const isAgencyAdmin = session.currentMembership.roleCode === 'AGENCY_ADMIN';
  if (!isAgencyAdmin) return <TenantSelector presentation={presentation} />;

  const label = support === null ? 'Platform workspace' : 'Support client';
  const name = support === null ? 'Agency dashboard' : support.clientOrganization.name;
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="truncate text-sm font-semibold">{name}</p>
    </div>
  );
}

function UserSummary({ loggingOut, onLogout }: { loggingOut: boolean; onLogout(): void }) {
  const session = useAuth().session;
  const requestedSection = accountSettingsSectionFromLocation();
  const [settingsOpen, setSettingsOpen] = useState(requestedSection !== null);
  const [settingsSection, setSettingsSection] = useState<AccountSettingsSection>(
    requestedSection ?? 'profile',
  );

  if (session === null || session.currentMembership === null) return null;
  const initials = session.user.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const tone = avatarTone(session.user.email);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${tone}`}
      >
        {initials || 'U'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{session.user.displayName}</p>
        <p className="truncate text-xs text-[var(--sidebar-muted)]">{session.user.email}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Open account menu"
          className="hover:bg-muted/20 grid size-8 shrink-0 place-items-center rounded-md text-current"
        >
          <EllipsisVertical aria-hidden="true" className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72" side="right">
          <div className="flex items-start gap-3 px-2.5 py-2">
            <span
              aria-hidden="true"
              className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold ${tone}`}
            >
              {initials || 'U'}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{session.user.displayName}</p>
              <p className="text-muted-foreground truncate text-xs">{session.user.email}</p>
              <Badge className="mt-2" variant="secondary">
                {session.currentMembership.roleName}
              </Badge>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setSettingsSection('profile');
              setSettingsOpen(true);
            }}
          >
            <Settings2 aria-hidden="true" />
            Account settings
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
            disabled={loggingOut}
            onClick={onLogout}
          >
            {loggingOut ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <LogOut aria-hidden="true" />
            )}
            {loggingOut ? 'Signing out' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AccountSettingsDialog
        initialSection={settingsSection}
        key={settingsSection}
        onOpenChange={(nextOpen) => {
          setSettingsOpen(nextOpen);
          if (!nextOpen && window.location.search.includes('settings=')) {
            const url = new URL(window.location.href);
            url.searchParams.delete('settings');
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
          }
        }}
        open={settingsOpen}
      />
    </div>
  );
}

function accountSettingsSectionFromLocation(): AccountSettingsSection | null {
  if (typeof window === 'undefined') return null;
  const requestedSection = new URLSearchParams(window.location.search).get('settings');
  return requestedSection === 'profile' ||
    requestedSection === 'methods' ||
    requestedSection === 'mfa' ||
    requestedSection === 'sessions'
    ? requestedSection
    : null;
}
