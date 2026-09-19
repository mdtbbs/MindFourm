'use client';

import { usePathname } from 'next/navigation';
import AuthFlowShell from '@/components/layout/auth-flow-shell';
import ContentShell from '@/components/layout/content-shell';

const AUTH_FLOW_PATHS = new Set(['/login', '/register', '/callback', '/accept-terms']);

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname && AUTH_FLOW_PATHS.has(pathname)) {
    return <AuthFlowShell>{children}</AuthFlowShell>;
  }

  return <ContentShell>{children}</ContentShell>;
}
