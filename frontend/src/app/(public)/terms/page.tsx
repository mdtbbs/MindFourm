export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Terms</p>
        <h1 className="mt-3 text-3xl font-bold text-[var(--text)]">服务条款</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-[var(--text-secondary)]">
          <p>
            使用本站时，请遵守所在地法律法规、社区规则和基本讨论礼仪，不发布违法、侵权、恶意攻击或破坏社区秩序的内容。
          </p>
          <p>
            本页面当前为基础占位条款，不构成完整法律文本。正式服务条款应在上线前由站点运营方补充确认。
          </p>
        </div>
      </div>
    </div>
  );
}
