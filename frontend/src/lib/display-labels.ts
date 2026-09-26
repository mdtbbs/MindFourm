export const ROLE_LABELS: Record<string, string> = {
  super_admin: "超级管理员",
  admin: "管理员",
  moderator: "版主",
  core_user: "核心用户",
  active_user: "活跃用户",
  user: "用户",
  guest: "访客",
  bot: "机器人",
};

export function roleLabel(role?: string | null): string {
  if (!role) return "用户";
  return ROLE_LABELS[role] || role;
}

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  external: "外部链接",
  upload: "本站文件",
};

export function resourceTypeLabel(type?: string | null): string {
  if (!type) return "未知";
  return RESOURCE_TYPE_LABELS[type] || type;
}

export const RESOURCE_KINDS = resourceKinds;

export const RESOURCE_KIND_LABELS: Record<string, string> = Object.fromEntries(
  RESOURCE_KINDS.map(({ value, label }) => [value, label]),
);

export function resourceKindLabel(kind?: string | null): string {
  if (!kind) return "资源";
  return RESOURCE_KIND_LABELS[kind] || "其他";
}
import resourceKinds from '../../../src/common/resource-kinds.json';
