import { RESOURCE_KINDS } from "@/lib/display-labels";

export interface PublicNavigationChild {
  label: string;
  href: string;
}

export interface PublicNavigationItem {
  id: "forum" | "resources" | "discover";
  label: string;
  children: PublicNavigationChild[];
}

export const PUBLIC_NAVIGATION: PublicNavigationItem[] = [
  {
    id: "forum",
    label: "论坛",
    children: [
      { label: "最新讨论", href: "/threads" },
      { label: "论坛板块", href: "/categories" },
      { label: "标签", href: "/tags" },
    ],
  },
  {
    id: "resources",
    label: "资源",
    children: [
      { label: "资源中心", href: "/resources" },
      ...RESOURCE_KINDS.filter(({ showInNavigation }) => showInNavigation).map(
        ({ value, label }) => ({
          label,
          href: `/resources?resource_kind=${value}`,
        }),
      ),
    ],
  },
  {
    id: "discover",
    label: "发现",
    children: [
      { label: "发现首页", href: "/discover" },
      { label: "联机房间", href: "/lanlink" },
      { label: "公告", href: "/notices" },
    ],
  },
];
