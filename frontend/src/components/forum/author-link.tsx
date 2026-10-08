import Link from 'next/link';
import Badge from '@/components/ui/badge';
import type { UserRole } from '@/types';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n/provider';

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

/** Roles map to locale keys; the badge must read in the visitor's language. */
const roleLabelKeys: Record<string, string> = {
  super_admin: 'roles.super_admin',
  admin: 'roles.admin',
  moderator: 'roles.moderator',
  core_user: 'roles.core_user',
  active_user: 'roles.active_user',
  user: 'roles.user',
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

function getRoleLabel(role: UserRole | string | null | undefined, t: (key: string) => string) {
  if (!role) return null;
  const key = roleLabelKeys[role];
  return key ? t(key) : role;
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
  const { t } = useI18n();
  const displayName = name?.trim() || t('cards.userFallback', { id: userId });
  const initial = displayName.trim().charAt(0).toUpperCase() || '#';
  const roleLabel = getRoleLabel(role, t);
  const classes = sizeClasses[size];
  const meta = t('cards.userMeta', { id: userId });

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
