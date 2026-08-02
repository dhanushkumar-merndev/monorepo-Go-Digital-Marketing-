import '@gdm/ui/globals.css';

import { colors } from '@gdm/design-tokens';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  description: 'Office dashboard for Go Digital Automobile CRM.',
  title: {
    default: 'Go Digital Automobile CRM',
    template: '%s | Go Digital Automobile CRM',
  },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: colors.background,
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
