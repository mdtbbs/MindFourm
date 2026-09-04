"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import ServerSidebar from "@/components/forum/server-sidebar";
import MyServersList from "@/components/forum/my-servers-list";
import ServerApplyForm from "@/components/forum/server-apply-form";
import PublicServerGrid from "@/components/forum/public-server-grid";
import FeatureGate from "@/components/forum/feature-gate";
import { Lock } from "lucide-react";

function AuthRequiredSection() {
  // 获取当前页面路径作为登录后的跳转目标
  const currentPath =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";

  return (
    <div className="text-center py-16 bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)]">
      <Lock className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
      <p className="text-[var(--text-secondary)] mb-4">请先登录后查看此内容</p>
      <a
        href={`/login?redirect=${encodeURIComponent(currentPath)}`}
        className="inline-flex items-center px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
      >
        登录
      </a>
    </div>
  );
}

function SectionContent({
  section,
  isAuthenticated,
}: {
  section: string;
  isAuthenticated: boolean;
}) {
  switch (section) {
    case "my":
      return isAuthenticated ? <MyServersList /> : <AuthRequiredSection />;
    case "apply":
      return isAuthenticated ? <ServerApplyForm /> : <AuthRequiredSection />;
    case "public":
      return <PublicServerGrid />;
    default:
      return isAuthenticated ? <MyServersList /> : <PublicServerGrid />;
  }
}

function ServersContent() {
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const section = searchParams?.get("section") || "";

  const currentSection = section || (isAuthenticated ? "my" : "public");

  return (
    <FeatureGate settingKey="feature_servers_enabled" label="游戏服务器">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          <ServerSidebar />
          <div className="flex-1 min-w-0">
            <SectionContent
              section={currentSection}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </div>
      </div>
    </FeatureGate>
  );
}

export default function ServersPage() {
  return (
    <Suspense fallback={null}>
      <ServersContent />
    </Suspense>
  );
}
