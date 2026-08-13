import { SidebarNavigationItem } from './sidebar-navigation.util';

export function getDefaultSidebarNavigation(): SidebarNavigationItem[] {
  return [
    {
      id: 'home',
      label: '首页',
      href: '/',
      icon: 'Home',
      enabled: true,
      requiresAuth: false,
    },
    {
      id: 'categories',
      label: '分类',
      href: '/categories',
      icon: 'Folder',
      enabled: true,
      requiresAuth: false,
    },
    {
      id: 'tags',
      label: '标签',
      href: '/tags',
      icon: 'Tag',
      enabled: true,
      requiresAuth: false,
    },
    {
      id: 'resources',
      label: '资源中心',
      href: '/resources',
      icon: 'Book',
      enabled: true,
      requiresAuth: false,
    },
    {
      id: 'notices',
      label: '公告中心',
      href: '/notices',
      icon: 'Bell',
      enabled: true,
      requiresAuth: false,
    },
  ];
}
