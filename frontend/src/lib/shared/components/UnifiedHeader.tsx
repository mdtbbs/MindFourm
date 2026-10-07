"use client";

import Link from "next/link";
import {
  Search,
  User as UserIcon,
  LogOut,
  Moon,
  Sun,
  Mail,
  Bell,
  Plus,
  Menu,
  Users,
} from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { User } from "../types";

export interface UnifiedHeaderProps {
  showSearch?: boolean;
  showPostButton?: boolean;
  showMessages?: boolean;
  showNotifications?: boolean;
  showFriends?: boolean;
  showServerCount?: boolean;
  showMobileMenu?: boolean;

  siteName?: string;
  siteTagline?: string;
  logoUrl?: string;
  labels?: Partial<Record<'searchCommunity' | 'search' | 'searchShortcut' | 'create' | 'switchToLight' | 'switchToDark' | 'theme' | 'menu' | 'notifications' | 'messages' | 'friends' | 'servers' | 'createPost' | 'profile' | 'myContent' | 'developerCenter' | 'bookmarks' | 'admin' | 'settings' | 'logout' | 'register' | 'login', string>>;

  user?: User | null;
  isAuthenticated?: boolean;
  serverCount?: number;
  unreadMessageCount?: number;
  unreadNotificationCount?: number;
  unreadFriendRequestCount?: number;

  onLogin?: () => void;
  onRegister?: () => void;
  onLogout?: () => void;
  onSearch?: (query: string) => void;
  onOpenSearch?: () => void;
  onPostCreate?: () => void;
  onMobileMenuClick?: () => void;

  // Slots for custom content
  topNavigationSlot?: React.ReactNode;
  createMenuSlot?: React.ReactNode;
  notificationDropdownSlot?: React.ReactNode;
  userMenuSlot?: React.ReactNode;
  utilitySlot?: React.ReactNode;
  mobileMenuSlot?: React.ReactNode;
}

export function UnifiedHeader({
  showSearch = false,
  showPostButton = false,
  showMessages = false,
  showNotifications = false,
  showFriends = false,
  showServerCount = false,
  showMobileMenu = false,
  siteName = "",
  siteTagline,
  logoUrl,
  labels = {},
  user,
  isAuthenticated = false,
  serverCount = 0,
  unreadMessageCount = 0,
  unreadNotificationCount = 0,
  unreadFriendRequestCount = 0,
  onLogin,
  onRegister,
  onLogout,
  onSearch,
  onOpenSearch,
  onPostCreate,
  onMobileMenuClick,
  topNavigationSlot,
  createMenuSlot,
  notificationDropdownSlot,
  userMenuSlot,
  utilitySlot,
  mobileMenuSlot,
}: UnifiedHeaderProps) {
  const { theme, toggle: toggleTheme } = useTheme();

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSearch) {
      onSearch((e.target as HTMLInputElement).value);
    }
  };

  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)] backdrop-blur-sm"
      style={{ background: "var(--bg)" }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-5">
            {topNavigationSlot && (
              <div className="min-w-0">{topNavigationSlot}</div>
            )}
          </div>

          {showSearch && (
            <div className="hidden min-w-0 flex-1 lg:block lg:max-w-lg">
              {onOpenSearch ? <button type="button" data-testid="global-search-trigger-desktop" onClick={onOpenSearch} aria-keyshortcuts="Control+K Meta+K" className="relative flex min-h-11 w-full items-center border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-left text-sm text-[var(--text-muted)] hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  <Search className="h-4 w-4" />
                </div>
                <span className="min-w-0 flex-1 truncate pl-7">{labels.searchCommunity || "搜索帖子、资源、用户..."}</span>
                <kbd className="ml-2 hidden shrink-0 items-center gap-1 border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-1 text-[10px] text-[var(--text-muted)] xl:inline-flex">{labels.searchShortcut || 'Ctrl K'}</kbd>
              </button> : <div className="relative">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"><Search className="h-4 w-4" /></div>
                <input type="text" placeholder={labels.searchCommunity || "搜索帖子、资源、用户..."} aria-label={labels.search || "搜索"} className="w-full border-0 bg-[var(--bg-elevated)] py-2 pl-10 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--primary)]" onKeyDown={handleSearchKeyDown} />
              </div>}
            </div>
          )}

          <div className="flex shrink-0 items-center space-x-1 sm:space-x-2">
            {utilitySlot}
            <button
              onClick={toggleTheme}
              className="relative rounded-full p-2.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--primary)]"
              title={theme === "dark" ? (labels.switchToLight || "切换到亮色模式") : (labels.switchToDark || "切换到暗色模式")}
              aria-label={labels.theme || "切换主题"}
            >
              <div className="relative z-10">
                {theme === "dark" ? (
                  <Sun className="h-5 w-5 text-[var(--accent)]" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </div>
            </button>

            {showMobileMenu && onMobileMenuClick && (
              <button
                onClick={onMobileMenuClick}
                data-testid="mobile-menu-button"
                className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] lg:hidden"
                aria-label={labels.menu || "菜单"}
              >
                <Menu className="h-6 w-6" />
              </button>
            )}

            {showSearch && (onOpenSearch ? <button type="button" data-testid="global-search-trigger-mobile" onClick={onOpenSearch} aria-keyshortcuts="Control+K Meta+K" className="flex min-h-11 min-w-11 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] lg:hidden" aria-label={labels.search || "搜索"}><Search className="h-5 w-5" /></button> : <Link href="/search" className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--primary)] lg:hidden" aria-label={labels.search || "搜索"}><Search className="h-5 w-5" /></Link>)}

            {createMenuSlot && <div className="block">{createMenuSlot}</div>}

            {isAuthenticated && user ? (
              <>
                {showNotifications && (
                  <div className="block">
                    {notificationDropdownSlot || (
                      <Link
                        href="/notifications"
                        className="relative p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                        title={labels.notifications || "通知"}
                      >
                        <span>
                          <Bell className="h-5 w-5" />
                        </span>
                        {unreadNotificationCount > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                            {unreadNotificationCount > 9
                              ? "9+"
                              : unreadNotificationCount}
                          </span>
                        )}
                      </Link>
                    )}
                  </div>
                )}

                {showMessages && (
                  <div className="hidden lg:block">
                    <Link
                      href="/messages"
                      className="relative p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                      title={labels.messages || "私信"}
                    >
                      <span>
                        <Mail className="h-5 w-5" />
                      </span>
                      {unreadMessageCount > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                          {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                        </span>
                      )}
                    </Link>
                  </div>
                )}

                {showFriends && (
                  <div className="hidden lg:block">
                    <Link
                      href="/friends"
                      className="relative p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                      title={labels.friends || "好友"}
                    >
                      <span>
                        <Users className="h-5 w-5" />
                      </span>
                      {unreadFriendRequestCount > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                          {unreadFriendRequestCount > 9
                            ? "9+"
                            : unreadFriendRequestCount}
                        </span>
                      )}
                    </Link>
                  </div>
                )}

                {showServerCount && (
                  <div className="hidden text-sm text-[var(--text-muted)] md:block">
                    {labels.servers || "服务器"}: <span>{serverCount}</span>
                  </div>
                )}

                {showPostButton && !createMenuSlot && (
                  <div className="hidden lg:block">
                    <Link
                      href="/posts/new"
                      onClick={onPostCreate}
                      className="inline-flex items-center gap-1 bg-[var(--primary)] px-2.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] sm:px-4"
                    >
                      <span>
                        <Plus className="h-4 w-4" />
                      </span>
                      <span className="hidden sm:inline">{labels.createPost || "发帖"}</span>
                    </Link>
                  </div>
                )}

                <div className="hidden lg:block">
                  <details className="group relative">
                    <summary aria-haspopup="menu" className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">
                      {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <UserIcon className="h-5 w-5" />}
                      <span className="hidden sm:inline">{user.username}</span>
                    </summary>
                    <div role="menu" className="absolute right-0 top-full z-20 mt-2 min-w-52 border border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-lg">
                      <Link
                        href={`/users/${user.id}`}
                        role="menuitem"
                        onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
                        className="flex min-h-11 items-center px-3 py-2 text-sm hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
                      >
                        {labels.profile || "个人主页"}
                      </Link>
                      <Link
                        href="/me"
                        role="menuitem"
                        onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
                        className="flex min-h-11 items-center px-3 py-2 text-sm hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
                      >
                        {labels.myContent || "我的内容"}
                      </Link>
                      <Link href="/settings" role="menuitem" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')} className="flex min-h-11 items-center px-3 py-2 text-sm hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]">{labels.settings || "设置"}</Link>
                      <Link href="/developers" role="menuitem" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')} className="flex min-h-11 items-center px-3 py-2 text-sm hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]">{labels.developerCenter || "开发者中心"}</Link>
                      {user.role === "admin" && (
                        <Link
                          href="/admin"
                          role="menuitem"
                          onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
                          className="flex min-h-11 items-center px-3 py-2 text-sm hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
                        >
                          {labels.admin || "管理后台"}
                        </Link>
                      )}
                      {userMenuSlot}
                      {onLogout && (
                        <button
                          type="button"
                          onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onLogout(); }}
                          role="menuitem"
                          className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
                        >
                          <LogOut className="h-4 w-4" />
                          {labels.logout || "退出登录"}
                        </button>
                      )}
                    </div>
                  </details>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                {onRegister && (
                  <Link
                    href="/register"
                    onClick={(event) => {
                      event.preventDefault();
                      onRegister();
                    }}
                    className="hidden bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] lg:inline-flex"
                  >
                    {labels.register || "注册"}
                  </Link>
                )}
                {onLogin && (
                  <Link
                    href="/login"
                    onClick={(event) => {
                      event.preventDefault();
                      onLogin();
                    }}
                    className="hidden text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)] lg:inline-flex"
                  >
                    {labels.login || "登录"}
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileMenuSlot}
    </header>
  );
}
