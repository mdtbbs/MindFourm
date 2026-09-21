import ResourceSubmitForm from '@/components/forum/resource-submit-form';
import Link from 'next/link';
import { ClipboardPaste, Map } from 'lucide-react';

export default function ResourceSubmitPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">提交资源</h1>
      <p className="mb-6 text-sm text-[var(--text-muted)]">
        普通资源可选择文件或外链；地图和蓝图使用专用工作台，可在提交前解析并预览。
      </p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link href="/resources/submit/map" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--primary)]/60">
          <Map className="mb-2 h-5 w-5 text-[var(--primary)]" />
          <p className="font-medium text-[var(--text)]">提交地图</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">上传 .msav，提交前查看地图预览。</p>
        </Link>
        <Link href="/resources/submit/schematic" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--primary)]/60">
          <ClipboardPaste className="mb-2 h-5 w-5 text-[var(--primary)]" />
          <p className="font-medium text-[var(--text)]">提交蓝图</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">上传 .msch 或粘贴蓝图代码。</p>
        </Link>
      </div>
      <ResourceSubmitForm />
    </div>
  );
}
