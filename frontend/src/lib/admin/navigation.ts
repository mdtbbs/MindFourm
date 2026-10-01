import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  MessageSquareText,
  Package,
  Users,
  Megaphone,
  Braces,
  Settings2,
  BellRing,
  ShieldCheck,
  Flag,
  FileText,
  FileEdit,
  Tag,
  FolderTree,
  ListChecks,
  Layers3,
  UsersRound,
  TrendingUp,
  Coins,
  Award,
  Ban,
  Navigation,
  Mail,
  ShoppingBag,
  KeyRound,
  Puzzle,
  Palette,
  PanelLeft,
  ToggleLeft,
  Search,
  FileCheck,
  Clock3,
  Gauge,
  GitMerge,
  ScrollText,
  Trash2,
  HardDrive,
} from 'lucide-react';
import type { UserRole } from '@/types';

export type AdminSectionKey =
  | 'overview'
  | 'community'
  | 'resources'
  | 'users'
  | 'operations'
  | 'developers'
  | 'system';

export interface AdminNavItem {
  key: string;
  label: string;
  href?: string;
  icon: LucideIcon;
  roles: UserRole[];
  keywords?: string[];
  disabled?: boolean;
  exact?: boolean;
}

export interface AdminNavSection {
  key: AdminSectionKey;
  label: string;
  icon: LucideIcon;
  href: string;
  roles: UserRole[];
  feature?: 'resources';
  items: AdminNavItem[];
}

const adminOnly: UserRole[] = ['admin'];
const staff: UserRole[] = ['admin', 'moderator'];

export const adminNavSections: AdminNavSection[] = [
  {
    key: 'overview',
    label: '工作台',
    icon: LayoutDashboard,
    href: '/admin',
    roles: staff,
    items: [
      { key: 'dashboard', label: '总览', href: '/admin', icon: LayoutDashboard, roles: staff, exact: true, keywords: ['dashboard', '首页'] },
      { key: 'notifications', label: '后台通知', href: '/admin/notifications', icon: BellRing, roles: staff, keywords: ['提醒', '事件'] },
      { key: 'moderation', label: '审核工作台', href: '/admin/content/moderation', icon: ShieldCheck, roles: staff, keywords: ['审核', '待审'] },
      { key: 'reports', label: '举报处理', href: '/admin/content/reports', icon: Flag, roles: staff, keywords: ['举报', '投诉'] },
    ],
  },
  {
    key: 'community',
    label: '社区',
    icon: MessageSquareText,
    href: '/admin/posts',
    roles: staff,
    items: [
      { key: 'posts', label: '帖子管理', href: '/admin/posts', icon: FileText, roles: staff, keywords: ['主题', '内容'] },
      { key: 'pages', label: '页面管理', href: '/admin/content/pages', icon: FileEdit, roles: adminOnly, keywords: ['静态页面'] },
      { key: 'tags', label: '标签管理', href: '/admin/content/tags', icon: Tag, roles: adminOnly },
      { key: 'categories', label: '论坛分类', href: '/admin/categories', icon: FolderTree, roles: adminOnly, keywords: ['版块', '分类'] },
    ],
  },
  {
    key: 'resources',
    label: '资源',
    icon: Package,
    href: '/admin/resources',
    roles: staff,
    feature: 'resources',
    items: [
      { key: 'resources', label: '全部资源', href: '/admin/resources', icon: Package, roles: staff, exact: true, keywords: ['地图', '蓝图', 'mod'] },
      { key: 'resource-moderation', label: '资源审批', href: '/admin/resources/moderation', icon: ListChecks, roles: staff, keywords: ['待审核'] },
      { key: 'resource-categories', label: '资源分类', href: '/admin/resources/categories', icon: Layers3, roles: adminOnly },
      { key: 'resource-merge', label: '重复资源合并', href: '/admin/resources/merge', icon: GitMerge, roles: adminOnly, keywords: ['重复', '合并'] },
    ],
  },
  {
    key: 'users',
    label: '用户',
    icon: Users,
    href: '/admin/users',
    roles: adminOnly,
    items: [
      { key: 'users', label: '用户管理', href: '/admin/users', icon: Users, roles: adminOnly, keywords: ['账号', '成员'] },
      { key: 'groups', label: '用户组', href: '/admin/groups', icon: UsersRound, roles: adminOnly },
      { key: 'levels', label: '等级', href: '/admin/levels', icon: TrendingUp, roles: adminOnly },
      { key: 'points', label: '积分', href: '/admin/points', icon: Coins, roles: adminOnly },
      { key: 'badges', label: '徽章', href: '/admin/badges', icon: Award, roles: adminOnly },
      { key: 'bans', label: '封禁管理', href: '/admin/system/bans', icon: Ban, roles: adminOnly, keywords: ['处罚', 'ban'] },
    ],
  },
  {
    key: 'operations',
    label: '运营',
    icon: Megaphone,
    href: '/admin/settings/announce',
    roles: adminOnly,
    items: [
      { key: 'announce', label: '公告管理', href: '/admin/settings/announce', icon: Megaphone, roles: adminOnly },
      { key: 'notification-settings', label: '通知设置', href: '/admin/settings/notifications', icon: BellRing, roles: adminOnly },
      { key: 'email', label: '邮件模板', href: '/admin/settings/email', icon: Mail, roles: adminOnly },
      { key: 'navigation', label: '顶部导航', href: '/admin/settings/navigation', icon: Navigation, roles: adminOnly },
      { key: 'sidebar-navigation', label: '侧栏导航', href: '/admin/settings/sidebar', icon: PanelLeft, roles: adminOnly },
      { key: 'shop', label: '商城管理', href: '/admin/shop', icon: ShoppingBag, roles: adminOnly },
    ],
  },
  {
    key: 'developers',
    label: '开发者',
    icon: Braces,
    href: '/admin/settings/external-api',
    roles: adminOnly,
    items: [
      { key: 'external-api', label: '外部 API', href: '/admin/settings/external-api', icon: KeyRound, roles: adminOnly, keywords: ['api key', 'scope', '审计'] },
      { key: 'plugins', label: '插件管理', href: '/admin/plugins', icon: Puzzle, roles: adminOnly },
      { key: 'oauth-clients', label: 'OAuth 应用', icon: Braces, roles: adminOnly, disabled: true, keywords: ['client', 'pkce', '第三方应用'] },
      { key: 'webhooks', label: 'Webhook', icon: BellRing, roles: adminOnly, disabled: true, keywords: ['回调'] },
    ],
  },
  {
    key: 'system',
    label: '系统',
    icon: Settings2,
    href: '/admin/settings/basic',
    roles: adminOnly,
    items: [
      { key: 'basic', label: '基本设置', href: '/admin/settings/basic', icon: Settings2, roles: adminOnly },
      { key: 'brand', label: '品牌设置', href: '/admin/settings/brand', icon: Palette, roles: adminOnly },
      { key: 'footer', label: '页脚设置', href: '/admin/settings/footer', icon: PanelLeft, roles: adminOnly },
      { key: 'display', label: '显示设置', href: '/admin/settings/display', icon: Palette, roles: adminOnly },
      { key: 'features', label: '功能开关', href: '/admin/settings/features', icon: ToggleLeft, roles: adminOnly },
      { key: 'cloud-saves', label: '云存档', href: '/admin/settings/cloud-saves', icon: HardDrive, roles: adminOnly },
      { key: 'moderation-settings', label: '审核规则', href: '/admin/settings/moderation', icon: ShieldCheck, roles: adminOnly },
      { key: 'seo', label: 'SEO', href: '/admin/settings/seo', icon: Search, roles: adminOnly },
      { key: 'terms', label: '条款设置', href: '/admin/settings/terms', icon: FileCheck, roles: adminOnly },
      { key: 'posting-rules', label: '发帖规则', href: '/admin/system/rules', icon: FileCheck, roles: adminOnly },
      { key: 'rate-limits', label: '限流设置', href: '/admin/system/rate-limits', icon: Clock3, roles: adminOnly },
      { key: 'performance', label: '性能监控', href: '/admin/system/performance', icon: Gauge, roles: adminOnly },
      { key: 'logs', label: '操作日志', href: '/admin/logs', icon: ScrollText, roles: adminOnly },
      { key: 'cleanup', label: '数据维护', href: '/admin/system/cleanup', icon: Trash2, roles: adminOnly },
    ],
  },
];

function pathMatches(pathname: string, item: AdminNavItem): boolean {
  if (!item.href) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function visibleAdminSections(role: UserRole | undefined, resourcesEnabled: boolean): AdminNavSection[] {
  if (!role) return [];
  return adminNavSections
    .filter((section) => section.roles.includes(role))
    .filter((section) => section.feature !== 'resources' || resourcesEnabled)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}

export function resolveAdminLocation(
  pathname: string,
  sections: AdminNavSection[],
): { section: AdminNavSection; item?: AdminNavItem } | null {
  const matches = sections.flatMap((section) =>
    section.items
      .filter((item) => pathMatches(pathname, item))
      .map((item) => ({ section, item, score: item.href?.length ?? 0 })),
  );

  const best = matches.sort((a, b) => b.score - a.score)[0];
  if (best) return { section: best.section, item: best.item };

  const dashboard = sections.find((section) => section.key === 'overview');
  return dashboard ? { section: dashboard, item: dashboard.items[0] } : null;
}
