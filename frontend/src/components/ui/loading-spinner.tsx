'use client';

import { cn } from '@/lib/utils';

/** Shared Mindustry-inspired loader. Legacy variants resolve to this same indicator. */
type SpinnerVariant = 'hexagon' | 'blocks' | 'orbital' | 'simple';
type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

interface LoadingSpinnerProps {
  variant?: SpinnerVariant;
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const sizeConfig: Record<SpinnerSize, { container: string; hex: number }> = {
  sm: { container: 'h-5 w-5', hex: 10 },
  md: { container: 'h-8 w-8', hex: 14 },
  lg: { container: 'h-12 w-12', hex: 20 },
  xl: { container: 'h-16 w-16', hex: 26 },
};

const HEXAGON_PATH = 'M6,0 L12,3.5 L12,10.5 L6,14 L0,10.5 L0,3.5 Z';

function HexagonSpinner({ size }: { size: SpinnerSize }) {
  const { container, hex } = sizeConfig[size];
  const scale = hex / 14;
  return (
    <svg viewBox="0 0 42 26" className={cn(container, 'overflow-visible')} aria-hidden="true">
      <path d={HEXAGON_PATH} transform={`translate(1 5) scale(${scale})`} fill="var(--primary)" opacity="0.72" className="hexagon-pulse hexagon-pulse-delay-1" />
      <path d={HEXAGON_PATH} transform={`translate(15 5) scale(${scale})`} fill="var(--primary)" opacity="0.9" className="hexagon-pulse hexagon-pulse-delay-2" />
      <path d={HEXAGON_PATH} transform={`translate(29 5) scale(${scale})`} fill="var(--primary)" opacity="0.72" className="hexagon-pulse hexagon-pulse-delay-3" />
    </svg>
  );
}

function SimpleSpinner({ size }: { size: SpinnerSize }) {
  return <span className={cn('inline-block rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]', sizeConfig[size].container, 'animate-spin')} aria-hidden="true" />;
}

export default function LoadingSpinner({ variant = 'hexagon', size = 'md', className, label }: LoadingSpinnerProps) {
  return (
    <div
      className={cn('flex items-center justify-center', className)}
      {...(label ? { role: 'status', 'aria-label': label, 'aria-live': 'polite' as const } : { 'aria-hidden': true })}
    >
      {variant === 'simple' ? <SimpleSpinner size={size} /> : <HexagonSpinner size={size} />}
      {label && <span className="sr-only">{label}...</span>}
    </div>
  );
}

// Kept as aliases for internal imports while all visual variants share one design.
export { HexagonSpinner, HexagonSpinner as BlocksSpinner, HexagonSpinner as OrbitalSpinner, SimpleSpinner };
