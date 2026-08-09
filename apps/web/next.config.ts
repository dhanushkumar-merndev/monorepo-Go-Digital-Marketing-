import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';

import { buildWebSecurityHeaders } from './src/lib/security-headers';

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@gdm/design-tokens', '@gdm/ui'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: buildWebSecurityHeaders(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL),
      },
    ];
  },
};

export default nextConfig;
