import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Radio, Bell, Boxes } from "lucide-react";
import { getDiscoverSummary } from "@/lib/api/v1/discover";

export const metadata: Metadata = {
  title: "发现",
  description: "探索 Mindustry 社区的联机、资源和公告",
};

export default async function DiscoverPage() {
  let summary;
  try {
    summary = await getDiscoverSummary();
  } catch {
    summary = null;
  }
  const entries = [
    {
      href: "/lanlink",
      icon: Radio,
      title: "联机房间",
      description: "查看玩家公开的联机房间",
    },
    {
      href: "/resources",
      icon: Boxes,
      title: "资源中心",
      description: "浏览社区资源与工具",
    },
    {
      href: "/notices",
      icon: Bell,
      title: "社区公告",
      description: "查看最新公告和活动",
    },
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 border-b border-[var(--border)] pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
          Mindustry 社区
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text)]">发现</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          从联机、资源到社区动态，找到下一件值得参与的事。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {entries.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={title}
            href={href}
            className="group flex items-center justify-between border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--primary)]"
          >
            <span className="flex items-center gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--primary)]/10 text-[var(--primary)]">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-[var(--text)]">
                  {title}
                </span>
                <span className="mt-1 block text-sm text-[var(--text-secondary)]">
                  {description}
                </span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-[var(--text-muted)] transition group-hover:translate-x-1 group-hover:text-[var(--primary)]" />
          </Link>
        ))}
      </div>
      {summary && (
        <p className="mt-8 text-sm text-[var(--text-muted)]">
          {summary.total_resources} 个资源 · {summary.total_threads} 个讨论
        </p>
      )}
    </div>
  );
}
