export default function ThanksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Thanks</p>
        <h1 className="mt-3 text-3xl font-bold text-[var(--text)]">鸣谢</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-[var(--text-secondary)]">
          <p>
            感谢 Mindustry 原作者、开源生态维护者、社区资源作者、服务器运营者，以及每一位参与讨论和反馈的玩家。
          </p>
          <p>
            本页面当前为占位说明。后续可以补充贡献者名单、开源项目清单、设计与运营鸣谢等正式内容。
          </p>
        </div>
      </div>
    </div>
  );
}
