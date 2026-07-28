'use client';

import Link from 'next/link';
import { motion, type Easing, type Variants } from 'framer-motion';
import { Search, User as UserIcon, LogOut, Shield, Moon, Sun, Mail, Bell, Plus, Menu } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { User } from '../types';

const easeInOut: Easing = 'easeInOut';
const brandGlow = '0 0 20px color-mix(in srgb, var(--primary) 30%, transparent)';
const brandGlowStrong = '0 0 25px color-mix(in srgb, var(--primary) 40%, transparent)';
const brandFocusGlow = '0 0 8px color-mix(in srgb, var(--primary) 22%, transparent)';

export interface UnifiedHeaderProps {
  showSearch?: boolean;
  showPostButton?: boolean;
  showMessages?: boolean;
  showNotifications?: boolean;
  showServerCount?: boolean;
  showMobileMenu?: boolean;

  siteName?: string;
  siteTagline?: string;
  logoUrl?: string;

  user?: User | null;
  isAuthenticated?: boolean;
  serverCount?: number;
  unreadMessageCount?: number;
  unreadNotificationCount?: number;

  onLogin?: () => void;
  onRegister?: () => void;
  onLogout?: () => void;
  onSearch?: (query: string) => void;
  onPostCreate?: () => void;
  onMobileMenuClick?: () => void;

  // Slots for custom content
  topNavigationSlot?: React.ReactNode;
  notificationDropdownSlot?: React.ReactNode;
  mobileMenuSlot?: React.ReactNode;
}

const headerEntranceVariants: Variants = {
  hidden: {
    y: -20,
    opacity: 0,
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: easeInOut,
    },
  },
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.08,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: easeInOut },
  },
};

const themeIconVariants: Variants = {
  sun: {
    rotate: [0, 180, 360],
    scale: [1, 1.2, 1],
    opacity: [1, 0.85, 1],
    transition: {
      duration: 0.6,
      ease: easeInOut,
    },
  },
  moon: {
    rotate: [0, -180, -360],
    scale: [1, 1.2, 1],
    opacity: [1, 0.85, 1],
    transition: {
      duration: 0.6,
      ease: easeInOut,
    },
  },
};

const badgePulseVariants: Variants = {
  pulse: {
    scale: [1, 1.3, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: easeInOut,
    },
  },
};

const searchVariants: Variants = {
  idle: {
    width: '100%',
    boxShadow: '0 0 0 transparent',
  },
  focus: {
    boxShadow: brandFocusGlow,
    transition: {
      duration: 0.2,
      ease: easeInOut,
    },
  },
};

const buttonVariants: Variants = {
  hover: {
    scale: 1.03,
    y: -1,
    transition: {
      duration: 0.15,
      ease: easeInOut,
    },
  },
  tap: {
    scale: 0.96,
    transition: {
      duration: 0.1,
      ease: easeInOut,
    },
  },
};

export function UnifiedHeader({
  showSearch = false,
  showPostButton = false,
  showMessages = false,
  showNotifications = false,
  showServerCount = false,
  showMobileMenu = false,
  siteName = 'Mindustry',
  siteTagline,
  logoUrl,
  user,
  isAuthenticated = false,
  serverCount = 0,
  unreadMessageCount = 0,
  unreadNotificationCount = 0,
  onLogin,
  onRegister,
  onLogout,
  onSearch,
  onPostCreate,
  onMobileMenuClick,
  topNavigationSlot,
  notificationDropdownSlot,
  mobileMenuSlot,
}: UnifiedHeaderProps) {
  const { theme, toggle: toggleTheme } = useTheme();

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch((e.target as HTMLInputElement).value);
    }
  };

  return (
    <motion.header
      variants={headerEntranceVariants}
      initial="hidden"
      animate="visible"
      className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)] backdrop-blur-sm"
      style={{ background: 'var(--bg)' }}
    >
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.5, ease: easeInOut }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
          transformOrigin: 'left',
        }}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-5">
            <motion.div variants={itemVariants} className="shrink-0">
              <Link href="/" className="flex items-center gap-2">
                {logoUrl ? (
                  <motion.img
                    src={logoUrl}
                    alt={siteName}
                    className="h-8 object-contain"
                    whileHover={{ scale: 1.04, rotate: 1.5 }}
                  />
                ) : (
                  <motion.div className="flex items-center gap-2" whileHover={{ scale: 1.01 }}>
                    <motion.span
                      className="text-xl font-bold text-[var(--primary)]"
                      style={{
                        background: 'linear-gradient(90deg, var(--primary), var(--primary-light), var(--primary))',
                        backgroundSize: '200% auto',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                    >
                      {siteName}
                    </motion.span>
                    {siteTagline && (
                      <span className="hidden text-xs text-[var(--text-muted)] lg:inline">
                        {siteTagline}
                      </span>
                    )}
                  </motion.div>
                )}
              </Link>
            </motion.div>

            {topNavigationSlot && (
              <motion.div variants={itemVariants} className="min-w-0">
                {topNavigationSlot}
              </motion.div>
            )}
          </div>

          {showSearch && (
            <motion.div
              variants={itemVariants}
              className="hidden min-w-0 flex-1 md:block md:max-w-md lg:max-w-lg"
            >
              <motion.div className="relative" variants={searchVariants} initial="idle" whileFocus="focus">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  <Search className="h-4 w-4" />
                </div>
                <motion.input
                  type="text"
                  placeholder="搜索帖子、资源、用户..."
                  aria-label="搜索"
                  className="w-full border-0 bg-[var(--bg-elevated)] py-2 pl-10 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--primary)]"
                  onKeyDown={handleSearchKeyDown}
                  whileFocus={{ boxShadow: brandFocusGlow }}
                />
              </motion.div>
            </motion.div>
          )}

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex shrink-0 items-center space-x-1 sm:space-x-2"
          >
            <motion.button
              variants={itemVariants}
              onClick={toggleTheme}
              whileHover={{
                scale: 1.12,
                rotate: theme === 'dark' ? -20 : 20,
                boxShadow: brandGlowStrong,
              }}
              whileTap={{ scale: 0.88 }}
              className="relative overflow-visible rounded-full p-2.5 text-[var(--text-secondary)] transition-all hover:text-[var(--primary)]"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              aria-label="切换主题"
            >
              <motion.div
                className="absolute inset-0 rounded-full bg-[var(--primary)]"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 0, opacity: 0 }}
                whileTap={{
                  scale: 2.5,
                  opacity: [0.4, 0],
                  transition: { duration: 0.4 },
                }}
              />
              <motion.div variants={themeIconVariants} animate={theme === 'dark' ? 'sun' : 'moon'} className="relative z-10">
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5 text-[var(--accent)]" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </motion.div>
              <motion.div
                className="absolute inset-0 rounded-full"
                initial={{ opacity: 0 }}
                whileHover={{
                  opacity: 0.15,
                  background: 'radial-gradient(circle, var(--primary), transparent)',
                  scale: 1.5,
                }}
              />
            </motion.button>

            {showMobileMenu && onMobileMenuClick && (
              <motion.button
                variants={itemVariants}
                onClick={onMobileMenuClick}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] md:hidden"
                aria-label="菜单"
              >
                <Menu className="h-6 w-6" />
              </motion.button>
            )}

            {isAuthenticated && user ? (
              <>
                {showNotifications && (
                  <motion.div variants={itemVariants}>
                    {notificationDropdownSlot || (
                      <Link
                        href="/notifications"
                        className="relative p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                        title="通知"
                      >
                        <motion.div whileHover={{ scale: 1.08 }}>
                          <Bell className="h-5 w-5" />
                        </motion.div>
                        {unreadNotificationCount > 0 && (
                          <motion.span
                            variants={badgePulseVariants}
                            animate="pulse"
                            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
                          >
                            {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                          </motion.span>
                        )}
                      </Link>
                    )}
                  </motion.div>
                )}

                {showMessages && (
                  <motion.div variants={itemVariants}>
                    <Link
                      href="/messages"
                      className="relative p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                      title="私信"
                    >
                      <motion.div whileHover={{ scale: 1.08, rotate: 4 }}>
                        <Mail className="h-5 w-5" />
                      </motion.div>
                      {unreadMessageCount > 0 && (
                        <motion.span
                          variants={badgePulseVariants}
                          animate="pulse"
                          className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
                        >
                          {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                        </motion.span>
                      )}
                    </Link>
                  </motion.div>
                )}

                {showServerCount && (
                  <motion.div variants={itemVariants} className="hidden text-sm text-[var(--text-muted)] md:block">
                    服务器:{' '}
                    <motion.span
                      animate={serverCount > 0 ? {
                        color: ['var(--text-muted)', 'var(--primary)', 'var(--text-muted)'],
                        transition: { duration: 2, repeat: Infinity },
                      } : undefined}
                    >
                      {serverCount}
                    </motion.span>
                  </motion.div>
                )}

                {showPostButton && onPostCreate && (
                  <motion.div variants={itemVariants} whileHover="hover" whileTap="tap">
                    <Link
                      href="/posts/new"
                      onClick={onPostCreate}
                      className="hidden items-center gap-1 bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] sm:inline-flex"
                    >
                      <motion.span animate={{ rotate: [0, 90, 0] }} transition={{ duration: 0.3 }}>
                        <Plus className="h-4 w-4" />
                      </motion.span>
                      发帖
                    </Link>
                  </motion.div>
                )}

                {user.role === 'admin' && (
                  <motion.div variants={itemVariants}>
                    <Link
                      href="/admin"
                      className="relative p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                      title="管理后台"
                    >
                      <motion.div
                        whileHover={{ scale: 1.08, rotate: 8, boxShadow: brandGlow }}
                        animate={{
                          color: ['var(--text-secondary)', 'var(--primary)', 'var(--text-secondary)'],
                          transition: { duration: 3, repeat: Infinity },
                        }}
                      >
                        <Shield className="h-5 w-5" />
                      </motion.div>
                    </Link>
                  </motion.div>
                )}

                <motion.div variants={itemVariants}>
                  <Link
                    href={`/users/${user.id}`}
                    className="flex items-center space-x-2 px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                  >
                    <motion.div whileHover={{ scale: 1.08 }}>
                      <UserIcon className="h-4 w-4" />
                    </motion.div>
                    <span className="hidden sm:inline">{user.username}</span>
                  </Link>
                </motion.div>

                {onLogout && (
                  <motion.div variants={itemVariants}>
                    <motion.button
                      onClick={onLogout}
                      whileHover={{ scale: 1.08, color: '#ef4444' }}
                      whileTap={{ scale: 0.92 }}
                      className="p-2 text-[var(--text-secondary)] transition-colors hover:text-red-600"
                      title="退出登录"
                      aria-label="退出登录"
                    >
                      <LogOut className="h-5 w-5" />
                    </motion.button>
                  </motion.div>
                )}
              </>
            ) : (
              <motion.div variants={containerVariants} initial="hidden" animate="visible" className="flex items-center gap-3">
                {onRegister && (
                  <motion.button
                    variants={buttonVariants}
                    onClick={onRegister}
                    whileHover="hover"
                    whileTap="tap"
                    className="bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)]"
                  >
                    注册
                  </motion.button>
                )}
                {onLogin && (
                  <motion.button
                    variants={itemVariants}
                    onClick={onLogin}
                    whileHover={{ scale: 1.04 }}
                    className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                  >
                    登录
                  </motion.button>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>

      {mobileMenuSlot}
    </motion.header>
  );
}
