'use client';

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth/context';
import { useSetting } from '@/store/settings-store';
import { useSettings } from '@/lib/settings/context';
import { resolveBrand } from '@/lib/theme/brand';
import { visibleAdminSections } from '@/lib/admin/navigation';
import AdminGuard from '@/components/admin/admin-guard';
import AdminShell from '@/components/admin/admin-shell';
import '@/styles/admin-responsive.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const resourcesEnabled = useSetting('feature_resources_enabled', 'true') !== 'false';
  const siteName = resolveBrand(useSettings()).siteName;

  const sections = useMemo(
    () => visibleAdminSections(user?.role, resourcesEnabled),
    [resourcesEnabled, user?.role],
  );

  return (
    <AdminGuard>
      <AdminShell siteName={siteName} sections={sections}>
        {children}
      </AdminShell>
    </AdminGuard>
  );
}
