import Link from 'next/link';
import Badge from '@/components/ui/badge';
import type { UserRole } from '@/types';
import { cn } from '@/lib/utils';

type AuthorLinkSize = 'sm' | 'md' | 'lg';

type AuthorLinkLayout = 'inline' | 'stacked';

interface AuthorLinkProps {
  userId: number;
  name?: string | null;
  avatarUrl?: string | null;
  role?: UserRole | string | null;
  size?: AuthorLinkSize;
  layout?: AuthorLinkLayout;
  showMeta?: boolean;
  className?: string;
}

const roleLabels: Record<string, string> = {
  super_admin: '超管',
  admin: '管理员',
  moderator: '版主',
  core_user: '核心用户',
  active_user: '活跃用户',
  user: '用户',
};

const roleVariants: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  super_admin: 'warning',
  admin: 'warning',
  moderator: 'success',
  core_user: 'primary',
  active_user: 'primary',
  user: 'default',
};

const sizeClasses: Record<AuthorLinkSize, { avatar: string; fallback: string; name: string; meta: string }> = {
  sm: {
    avatar: 'h-7 w-7',
    fallback: 'text-xs',
    name: 'text-sm',
    meta: 'text-[11px]',
  },
  md: {
    avatar: 'h-9 w-9',
    fallback: 'text-sm',
    name: 'text-sm',
    meta: 'text-xs',
  },
  lg: {
    avatar: 'h-12 w-12',
    fallback: 'text-base',
    name: 'text-base',
    meta: 'text-xs',
  },
};

function getRoleLabel(role?: UserRole | string | null) {
  if (!role) return null;
  return roleLabels[role as UserRole] || role;
}

function getRoleVariant(role?: UserRole | string | null) {
  return roleVariants[role as UserRole] || 'default';
}

export default function AuthorLink({
  userId,
  name,
  avatarUrl,
  role,
  size = 'md',
  layout = 'inline',
  showMeta = true,
  className = '',
}: AuthorLinkProps) {
  const displayName = name?.trim() || `用户 #${userId}`;
  const initial = displayName.trim().charAt(0).toUpperCase() || '#';
  const roleLabel = getRoleLabel(role);
  const classes = sizeClasses[size];
  const meta = `UID ${userId}`;

  return (
    <Link
      href={`/users/${userId}`}
      className={cn(
        'group inline-flex min-w-0 items-center gap-3 text-left hover:text-[var(--primary)]',
        layout === 'stacked' && 'items-start',
        className,
      )}
    >
      <span
        className={cn(
          'shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]',
          'flex items-center justify-center font-semibold shadow-sm',
          classes.avatar,
        )}
        aria-hidden="true"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className={classes.fallback}>{initial}</span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={cn('truncate font-semibold text-[var(--text)] group-hover:text-[var(--primary)]', classes.name)}>
            {displayName}
          </span>
          {roleLabel ? (
            <Badge variant={getRoleVariant(role)} className="shrink-0">
              {roleLabel}
            </Badge>
          ) : null}
        </span>
        {showMeta ? (
          <span className={cn('mt-0.5 block truncate text-[var(--text-muted)]', classes.meta)}>
            {meta}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
