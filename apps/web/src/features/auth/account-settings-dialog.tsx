'use client';

import { Button } from '@gdm/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gdm/ui/components/dialog';
import { KeyRound, Laptop2, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import { SessionsPanel } from '@/app/(app)/sessions/page';
import { AccountProfileSettings } from './account-profile-settings';
import { AccountMfaSettings } from './account-mfa-settings';
import { useAuth } from './auth-provider';
import { hasPermission } from './auth-types';
import { AuthenticationMethodsScreen } from './authentication-methods';

export type AccountSettingsSection = 'profile' | 'methods' | 'mfa' | 'sessions';

interface AccountSettingsDialogProps {
  initialSection?: AccountSettingsSection;
  open: boolean;
  onOpenChange(open: boolean): void;
}

interface SettingsItem {
  description: string;
  icon: LucideIcon;
  id: AccountSettingsSection;
  label: string;
}

const settingsItems: SettingsItem[] = [
  {
    description: 'Personal details and access',
    icon: UserRound,
    id: 'profile',
    label: 'Your profile',
  },
  {
    description: 'Email, password and Google',
    icon: KeyRound,
    id: 'methods',
    label: 'Sign-in methods',
  },
  {
    description: 'Extra sign-in protection',
    icon: ShieldCheck,
    id: 'mfa',
    label: 'Two-step verification',
  },
  {
    description: 'Review signed-in devices',
    icon: Laptop2,
    id: 'sessions',
    label: 'Active sessions',
  },
];

export function AccountSettingsDialog({
  initialSection = 'profile',
  open,
  onOpenChange,
}: AccountSettingsDialogProps) {
  const auth = useAuth();
  const [section, setSection] = useState<AccountSettingsSection>(initialSection);
  const canManage = auth.session !== null && hasPermission(auth.session, 'account.profile.update');
  const canReadSessions =
    auth.session !== null && hasPermission(auth.session, 'account.sessions.read');
  const visibleItems = settingsItems.filter((item) => item.id !== 'sessions' || canReadSessions);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setSection(initialSection);
    onOpenChange(nextOpen);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),64rem)] max-w-none overflow-hidden p-0">
        <DialogHeader className="border-border shrink-0 border-b px-5 py-4 pr-14">
          <DialogTitle>Account settings</DialogTitle>
          <DialogDescription>
            Manage your profile, sign-in options and active devices.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[13rem_minmax(0,1fr)] md:grid-rows-1">
          <aside className="border-border bg-muted/35 border-b p-2 md:border-r md:border-b-0">
            <nav
              aria-label="Account settings sections"
              className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible"
            >
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <Button
                    aria-current={active ? 'page' : undefined}
                    className="h-auto min-w-48 justify-start px-3 py-2.5 text-left md:w-full md:min-w-0"
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    type="button"
                    variant={active ? 'secondary' : 'ghost'}
                  >
                    <Icon aria-hidden="true" className="mt-0.5 size-4 self-start" />
                    <span className="min-w-0">
                      <span className="block font-medium">{item.label}</span>
                      <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
                        {item.description}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </nav>
          </aside>

          <main className="max-h-[calc(100dvh-10rem)] min-h-0 overflow-y-auto p-4 sm:p-5">
            {section === 'profile' ? <AccountProfileSettings /> : null}
            {section === 'methods' ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Sign-in options</h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Choose how you sign in to your account.
                  </p>
                </div>
                <AuthenticationMethodsScreen embedded />
              </div>
            ) : null}
            {section === 'mfa' ? <AccountMfaSettings canManage={canManage} /> : null}
            {section === 'sessions' && canReadSessions ? <SessionsPanel embedded /> : null}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
