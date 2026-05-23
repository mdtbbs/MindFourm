'use client';

import ResourceModerationTable from '@/components/admin/resource-moderation-table';

export default function AdminResourceModerationPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-surface-900 dark:text-gray-100 mb-6">资源审批</h2>
      <ResourceModerationTable />
    </div>
  );
}