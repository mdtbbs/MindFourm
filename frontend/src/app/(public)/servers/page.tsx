'use client';

import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import ServerSidebar from '@/components/forum/server-sidebar';
import MyServersList from '@/components/forum/my-servers-list';
import ServerApplyForm from '@/components/forum/server-apply-form';
import PublicServerGrid from '@/components/forum/public-server-grid';
import { Lock } from 'lucide-react';

function AuthRequiredSection() {
  return (
    <div className="text-center py-16 bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)]">
      <Lock className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
      <p className="text-[var(--text-secondary)] mb-4">请先登录后查看此内容</p>
      <a
        href="/login"
        className="inline-flex items-center px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
      >
        登录
      </a>
    </div>
  );
}

function SectionContent({ section, isAuthenticated }: { section: string; isAuthenticated: boolean }) {
  switch (section) {
    case 'my':
      return isAuthenticated ? <MyServersList /> : <AuthRequiredSection />;
    case 'apply':
      return isAuthenticated ? <ServerApplyForm /> : <AuthRequiredSection />;
    case 'public':
      return <PublicServerGrid />;
    default:
      return isAuthenticated ? <MyServersList /> : <PublicServerGrid />;
  }
}

export default function ServersPage() {
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const section = searchParams?.get('section') || '';

  const currentSection = section || (isAuthenticated ? 'my' : 'public');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-8">
        <ServerSidebar />
        <div className="flex-1 min-w-0">
          <SectionContent section={currentSection} isAuthenticated={isAuthenticated} />
        </div>
      </div>
    </div>
  );
}
