"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Boxes, ChevronDown, Compass } from "lucide-react";
import { UnifiedHeader } from "@/lib/shared";
import type { User } from "@/types";
import NotificationDropdown from "@/components/forum/notification-dropdown";
import { PUBLIC_NAVIGATION } from "@/lib/navigation/public-navigation";

const NAV_ICONS = {
  forum: BookOpen,
  resources: Boxes,
  discover: Compass,
} as const;

function DesktopNavigation({
  siteName,
  logoUrl,
}: {
  siteName: string;
  logoUrl?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpenId(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <nav
      ref={ref}
      aria-label="主导航"
      className="flex min-w-0 items-center gap-1"
    >
      <Link
        href="/"
        className="mr-2 flex shrink-0 items-center gap-2 font-semibold text-[var(--text)] hover:text-[var(--primary)]"
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-7 w-7 rounded object-cover" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--primary)] text-xs font-bold text-white">
            M
          </span>
        )}
        <span className="hidden xl:inline">{siteName}</span>
      </Link>
      {PUBLIC_NAVIGATION.map((item) => {
        const Icon = NAV_ICONS[item.id];
        const open = openId === item.id;
        return (
          <div key={item.id} className="relative hidden lg:block">
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="menu"
              onClick={() => setOpenId(open ? null : item.id)}
              className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
            >
              <Icon className="h-4 w-4" />
              {item.label}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
            {open && (
              <div
                role="menu"
                className="absolute left-0 top-full z-20 mt-2 min-w-40 border border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-lg"
              >
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    role="menuitem"
                    href={child.href}
                    onClick={() => setOpenId(null)}
                    className="block px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function ContentToolbar(props: {
  siteName: string;
  logoUrl?: string;
  user: User | null;
  isAuthenticated: boolean;
  unreadMessageCount: number;
  unreadFriendRequestCount: number;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
  onSearch: (query: string) => void;
  onOpenDrawer: () => void;
  showPublicNavigation: boolean;
}) {
  return (
    <UnifiedHeader
      showSearch
      showPostButton
      showNotifications
      showMobileMenu
      siteName={props.siteName}
      logoUrl={props.logoUrl}
      user={props.user}
      isAuthenticated={props.isAuthenticated}
      unreadMessageCount={props.unreadMessageCount}
      unreadFriendRequestCount={props.unreadFriendRequestCount}
      onLogin={props.onLogin}
      onRegister={props.onRegister}
      onLogout={props.onLogout}
      onSearch={props.onSearch}
      onMobileMenuClick={props.onOpenDrawer}
      notificationDropdownSlot={<NotificationDropdown />}
      topNavigationSlot={
        props.showPublicNavigation ? (
          <DesktopNavigation
            siteName={props.siteName}
            logoUrl={props.logoUrl}
          />
        ) : undefined
      }
    />
  );
}
