'use client';

import { useAuth } from '@/lib/auth/context';
import Link from 'next/link';
import { Settings } from 'lucide-react';

export default function ProfileEditLink({ userId }: { userId: number }) {
  const { user } = useAuth();
  if (!user || user.id !== userId) return null;

  return (
    <Link
      href="/users/me/edit"
      className="flex items-center gap-1 text-sm text-surface-500 hover:text-primary-600 transition-colors"
    >
      <Settings className="w-3.5 h-3.5" />
      编辑资料
    </Link>
  );
}
