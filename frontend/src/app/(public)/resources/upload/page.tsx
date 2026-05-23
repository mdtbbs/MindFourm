'use client';

import ResourceUploadForm from '@/components/forum/resource-upload-form';

export default function ResourceUploadPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-[var(--text)] mb-6">上传文件</h1>
      <ResourceUploadForm />
    </div>
  );
}