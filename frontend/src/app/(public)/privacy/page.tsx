export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Privacy</p>
        <h1 className="mt-3 text-3xl font-bold text-[var(--text)]">隐私政策</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-[var(--text-secondary)]">
          <p>
            本站会为登录、发帖、回复、通知和安全风控等功能处理必要的账户与操作数据，并尽量减少不必要的数据收集。
          </p>
          <p>
            本页面当前为基础占位说明，不构成完整隐私政策。正式隐私政策应在上线前根据实际部署、日志、第三方服务和数据保留策略补充。
          </p>
        </div>
      </div>
    </div>
  );
}
