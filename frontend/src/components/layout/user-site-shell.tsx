import ContentShell from '@/components/layout/content-shell';

/**
 * The persistent shell for every normal user-facing page. Authentication flows
 * intentionally use AuthFlowShell; /admin owns a separate AdminShell in its
 * route layout.
 */
export default function UserSiteShell({ children }: { children: React.ReactNode }) {
  return <ContentShell>{children}</ContentShell>;
}
