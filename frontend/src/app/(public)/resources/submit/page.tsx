import ResourceSubmitForm from '@/components/forum/resource-submit-form';

export default function ResourceSubmitPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">提交资源</h1>
      <p className="mb-6 text-sm text-[var(--text-muted)]">
        填写标题、版本号、短介绍和正文，并选择资源是文件还是外链。
      </p>
      <ResourceSubmitForm />
    </div>
  );
}
