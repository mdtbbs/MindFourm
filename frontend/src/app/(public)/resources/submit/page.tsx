'use client';

import ResourceSubmitForm from '@/components/forum/resource-submit-form';

export default function ResourceSubmitPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-[var(--text)] mb-6">提交外链</h1>
      <ResourceSubmitForm />
    </div>
  );
}