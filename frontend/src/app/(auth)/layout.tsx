import SiteShell from '@/components/layout/site-shell';

/**
 * Signed-in pages get the same shell as the public ones.
 *
 * This route group had no layout, so `/notifications`, `/bookmarks`,
 * `/users/me/edit`, `/apply-server` and `/servers/apply` rendered with no header,
 * navigation or footer at all.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteShell>{children}</SiteShell>;
}
