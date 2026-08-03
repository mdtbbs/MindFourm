export default function FeedbackPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Feedback</p>
        <h1 className="mt-3 text-3xl font-bold text-[var(--text)]">意见反馈</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-[var(--text-secondary)]">
          <p>
            如果你在使用论坛时遇到问题，或希望提出功能建议，可以通过社区管理渠道联系站点运营者。
          </p>
          <p>
            当前页面为站内反馈入口占位。后续可以接入表单、工单、GitHub Issues、邮箱或群组链接。
          </p>
        </div>
      </div>
    </div>
  );
}
