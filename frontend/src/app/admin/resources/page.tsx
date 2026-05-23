'use client';

import ResourceTable from '@/components/admin/resource-table';

export default function AdminResourcesPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-surface-900 dark:text-gray-100 mb-6">资源管理</h2>
      <ResourceTable />
    </div>
  );
}