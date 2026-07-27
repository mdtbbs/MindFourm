'use client';

import Link from 'next/link';
import { motion, type Easing, type Variants } from 'framer-motion';
import { User } from '../types';
import { useTheme } from '../hooks/useTheme';
import { Search, User as UserIcon, LogOut, Shield, Moon, Sun, Mail, Bell, Plus, Menu } from 'lucide-react';

const easeInOut: Easing = 'easeInOut';

export interface UnifiedHeaderProps {
  showSearch?: boolean;
  showPostButton?: boolean;
  showMessages?: boolean;
  showNotifications?: boolean;
  showServerCount?: boolean;
  showMobileMenu?: boolean;

  siteName?: string;
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
  notificationDropdownSlot?: React.ReactNode;
  mobileMenuSlot?: React.ReactNode;
}

// 入场动画变体
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

// 子元素 stagger 动画变体
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: easeInOut },
  },
};

// Logo shimmer 动画变体
const logoShimmerVariants: Variants = {
  shimmer: {
    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

// 主题切换图标动画变体 - 更丰富的切换动画
const themeIconVariants: Variants = {
  sun: {
    rotate: [0, 180, 360],
    scale: [1, 1.3, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 0.6,
      ease: easeInOut,
    },
  },
  moon: {
    rotate: [0, -180, -360],
    scale: [1, 1.3, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 0.6,
      ease: easeInOut,
    },
  },
};

// 主题切换按钮容器动画
const themeButtonVariants: Variants = {
  initial: { scale: 1 },
  tap: {
    scale: 0.85,
    transition: { duration: 0.1 },
  },
  hover: {
    boxShadow: '0 0 20px rgba(255, 107, 53, 0.3)',
    transition: { duration: 0.2 },
  },
};

// 通知徽章脉冲动画变体
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

// 搜索框动画变体
const searchVariants: Variants = {
  idle: {
    width: '100%',
    boxShadow: '0 0 0px rgba(255,107,53,0)',
  },
  focus: {
    boxShadow: '0 0 8px rgba(255,107,53,0.2)',
    transition: {
      duration: 0.2,
      ease: easeInOut,
    },
  },
};

// 按钮 hover 动画变体
const buttonVariants: Variants = {
  hover: {
    scale: 1.05,
    y: -1,
    transition: {
      duration: 0.15,
      ease: easeInOut,
    },
  },
  tap: {
    scale: 0.95,
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
      className="bg-[var(--bg)] border-b border-[var(--border)] sticky top-0 z-50 backdrop-blur-sm"
      style={{
        background: 'var(--bg)',
      }}
    >
      {/* 顶部装饰线 */}
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
          originX: 0,
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Logo */}
          <motion.div
            variants={itemVariants}
            className="flex items-center gap-2 shrink-0"
          >
            <Link href="/" className="flex items-center gap-2 shrink-0">
              {logoUrl ? (
                <motion.img
                  src={logoUrl}
                  alt={siteName}
                  className="h-8 object-contain"
                  whileHover={{ scale: 1.05, rotate: 2 }}
                />
              ) : (
                <motion.div
                  className="flex items-center gap-1"
                  whileHover={{ scale: 1.02 }}
                >
                  <motion.span
                    className="text-xl font-bold text-[var(--primary)]"
                    style={{
                      background: 'linear-gradient(90deg, var(--primary), #ff8c5a, var(--primary))',
                      backgroundSize: '200% auto',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {siteName}
                  </motion.span>
                  <motion.span
                    className="text-xs text-[var(--text-muted)]"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    (mdtbbs)
                  </motion.span>
                </motion.div>
              )}
            </Link>
          </motion.div>

          {/* Search */}
          {showSearch && (
            <motion.div
              variants={itemVariants}
              className="flex-1 max-w-lg mx-2 sm:mx-4 md:mx-8"
            >
              <motion.div
                className="relative"
                variants={searchVariants}
                initial="idle"
                whileFocus="focus"
              >
                <motion.div
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  whileHover={{ scale: 1.1 }}
                >
                  <Search className="w-4 h-4" />
                </motion.div>
                <motion.input
                  type="text"
                  placeholder="搜索..."
                  aria-label="搜索"
                  className="w-full pl-10 pr-4 py-1.5 sm:py-2 bg-[var(--bg-elevated)] text-[var(--text)] rounded-[var(--radius)] border-0 focus:ring-2 focus:ring-[var(--primary)] text-sm placeholder:text-[var(--text-muted)]"
                  onKeyDown={handleSearchKeyDown}
                  whileFocus={{
                    boxShadow: '0 0 8px rgba(255,107,53,0.2)',
                  }}
                />
              </motion.div>
            </motion.div>
          )}

          {/* Right Menu */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex items-center space-x-2 shrink-0"
          >
            {/* Theme Toggle */}
            <motion.button
              variants={itemVariants}
              onClick={toggleTheme}
              whileHover={{
                scale: 1.15,
                rotate: theme === 'dark' ? -20 : 20,
                boxShadow: '0 0 25px rgba(255, 107, 53, 0.4)',
              }}
              whileTap={{ scale: 0.85 }}
              className="p-2.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--primary)] transition-all relative overflow-visible"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              aria-label="切换主题"
            >
              {/* 切换时的波纹效果 */}
              <motion.div
                className="absolute inset-0 rounded-full bg-[var(--primary)]"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 0, opacity: 0 }}
                whileTap={{
                  scale: 2.5,
                  opacity: [0.4, 0],
                  transition: { duration: 0.4 }
                }}
              />

              <motion.div
                variants={themeIconVariants}
                animate={theme === 'dark' ? 'sun' : 'moon'}
                className="relative z-10"
              >
                {theme === 'dark' ? (
                  <Sun className="w-5 h-5 text-[var(--accent)]" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </motion.div>

              {/* 光效背景 */}
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

            {/* Mobile Menu Button */}
            {showMobileMenu && onMobileMenuClick && (
              <motion.button
                variants={itemVariants}
                onClick={onMobileMenuClick}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="md:hidden p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                aria-label="菜单"
              >
                <Menu className="w-6 h-6" />
              </motion.button>
            )}

            {isAuthenticated && user ? (
              <>
                {/* Notifications */}
                {showNotifications && (
                  motion.div ? (
                    <motion.div variants={itemVariants}>
                      {notificationDropdownSlot || (
                        <Link
                          href="/notifications"
                          className="relative p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                          title="通知"
                        >
                          <motion.div whileHover={{ scale: 1.1 }}>
                            <Bell className="w-5 h-5" />
                          </motion.div>
                          {unreadNotificationCount > 0 && (
                            <motion.span
                              variants={badgePulseVariants}
                              animate="pulse"
                              className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold"
                            >
                              {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                            </motion.span>
                          )}
                        </Link>
                      )}
                    </motion.div>
                  ) : null
                )}

                {/* Messages */}
                {showMessages && (
                  <motion.div variants={itemVariants}>
                    <Link
                      href="/messages"
                      className="relative p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                      title="私信"
                    >
                      <motion.div whileHover={{ scale: 1.1, rotate: 5 }}>
                        <Mail className="w-5 h-5" />
                      </motion.div>
                      {unreadMessageCount > 0 && (
                        <motion.span
                          variants={badgePulseVariants}
                          animate="pulse"
                          className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold"
                        >
                          {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                        </motion.span>
                      )}
                    </Link>
                  </motion.div>
                )}

                {/* Server Count (EasyManager) */}
                {showServerCount && (
                  <motion.div
                    variants={itemVariants}
                    className="hidden md:block text-[var(--text-muted)] text-sm"
                  >
                    服务器: <motion.span
                      animate={serverCount > 0 ? {
                        color: ['var(--text-muted)', 'var(--primary)', 'var(--text-muted)'],
                        transition: { duration: 2, repeat: Infinity },
                      } : undefined}
                    >
                      {serverCount}
                    </motion.span>
                  </motion.div>
                )}

                {/* Post Button */}
                {showPostButton && onPostCreate && (
                  <motion.div
                    variants={itemVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    <Link
                      href="/posts/new"
                      className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors flex items-center gap-1"
                    >
                      <motion.span
                        animate={{ rotate: [0, 90, 0] }}
                        transition={{ duration: 0.3 }}
                      >
                        <Plus className="w-4 h-4" />
                      </motion.span>
                      发帖
                    </Link>
                  </motion.div>
                )}

                {/* Admin Link */}
                {user.role === 'admin' && (
                  <motion.div variants={itemVariants}>
                    <Link
                      href="/admin"
                      className="p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors relative"
                      title="管理后台"
                    >
                      <motion.div
                        whileHover={{ scale: 1.1, rotate: 10 }}
                        animate={{
                          color: ['var(--text-secondary)', 'var(--primary)', 'var(--text-secondary)'],
                          transition: { duration: 3, repeat: Infinity },
                        }}
                      >
                        <Shield className="w-5 h-5" />
                      </motion.div>
                    </Link>
                  </motion.div>
                )}

                {/* User Profile */}
                <motion.div variants={itemVariants}>
                  <Link
                    href={`/users/${user.id}`}
                    className="flex items-center space-x-2 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                  >
                    <motion.div whileHover={{ scale: 1.1 }}>
                      <UserIcon className="w-4 h-4" />
                    </motion.div>
                    <span className="hidden sm:inline">{user.username}</span>
                  </Link>
                </motion.div>

                {/* Logout */}
                {onLogout && (
                  <motion.div variants={itemVariants}>
                    <motion.button
                      onClick={onLogout}
                      whileHover={{ scale: 1.1, color: '#ef4444' }}
                      whileTap={{ scale: 0.9 }}
                      className="p-2 text-[var(--text-secondary)] hover:text-red-600 transition-colors"
                      title="退出登录"
                      aria-label="退出登录"
                    >
                      <LogOut className="w-5 h-5" />
                    </motion.button>
                  </motion.div>
                )}
              </>
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="flex items-center gap-3"
              >
                {onRegister && (
                  <motion.button
                    variants={itemVariants}
                    onClick={onRegister}
                    whileHover="hover"
                    whileTap="tap"
                    className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
                  >
                    注册
                  </motion.button>
                )}
                {onLogin && (
                  <motion.button
                    variants={itemVariants}
                    onClick={onLogin}
                    whileHover={{ scale: 1.05 }}
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                  >
                    登录
                  </motion.button>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
      {/* Mobile Menu Content (if provided) */}
      {mobileMenuSlot}
    </motion.header>
  );
}