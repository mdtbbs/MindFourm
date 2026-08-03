export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">About</p>
        <h1 className="mt-3 text-3xl font-bold text-[var(--text)]">关于我们</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-[var(--text-secondary)]">
          <p>
            MindFourm 是面向 Mindustry 玩家与创作者的社区论坛，用于交流玩法、发布资源、记录教程和连接更多同好。
          </p>
          <p>
            这里会持续沉淀社区讨论、资源版本、服务器信息和玩家经验。正式的站点介绍文案可在后续根据运营需要替换。
          </p>
        </div>
      </div>
    </div>
  );
}
