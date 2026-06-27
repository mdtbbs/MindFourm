interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-surface-100 text-surface-600',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary/20 dark:text-primary',
  success: 'bg-green-100 text-green-700 dark:bg-green/20 dark:text-green',
  warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow/20 dark:text-yellow',
  danger: 'bg-red-100 text-red-700 dark:bg-red/20 dark:text-red',
};

export default function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
