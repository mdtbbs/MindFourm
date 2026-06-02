'use client';

import { cn } from '@/lib/utils';

/**
 * Mindustry-themed loading spinner with multiple animation variants
 * Industrial Pulse design system
 */

type SpinnerVariant = 'hexagon' | 'blocks' | 'orbital' | 'simple';
type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

interface LoadingSpinnerProps {
  variant?: SpinnerVariant;
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const sizeConfig: Record<SpinnerSize, { container: string; element: string }> = {
  sm: { container: 'h-5 w-5', element: 'h-2 w-2' },
  md: { container: 'h-8 w-8', element: 'h-3 w-3' },
  lg: { container: 'h-12 w-12', element: 'h-4 w-4' },
  xl: { container: 'h-16 w-16', element: 'h-5 w-5' },
};

// Hexagon SVG path
const HEXAGON_PATH = 'M6,0 L12,3.5 L12,10.5 L6,14 L0,10.5 L0,3.5 Z';

/**
 * Hexagon Pulse - Three hexagons with staggered pulsing animation
 */
function HexagonSpinner({ size }: { size: SpinnerSize }) {
  const config = sizeConfig[size];
  const hexSize = size === 'sm' ? 14 : size === 'md' ? 20 : size === 'lg' ? 28 : 36;
  const strokeWidth = size === 'sm' ? 1.5 : 2;

  return (
    <div className={cn('relative', config.container)}>
      <svg
        viewBox={`0 0 ${hexSize * 2.5} ${hexSize * 1.8}`}
        className="w-full h-full"
        aria-hidden="true"
      >
        {/* Hexagon 1 */}
        <path
          d={HEXAGON_PATH}
          transform={`translate(${hexSize * 0.3}, ${hexSize * 0.1}) scale(${hexSize / 14})`}
          fill="var(--primary)"
          className="hexagon-pulse hexagon-pulse-delay-1 loader-glow-subtle"
          opacity="0.7"
        />
        {/* Hexagon 2 */}
        <path
          d={HEXAGON_PATH}
          transform={`translate(${hexSize * 1}, ${hexSize * 0.6}) scale(${hexSize / 14})`}
          fill="var(--accent)"
          className="hexagon-pulse hexagon-pulse-delay-2"
          opacity="0.7"
        />
        {/* Hexagon 3 */}
        <path
          d={HEXAGON_PATH}
          transform={`translate(${hexSize * 1.7}, ${hexSize * 0.1}) scale(${hexSize / 14})`}
          fill="var(--primary)"
          className="hexagon-pulse hexagon-pulse-delay-3 loader-glow-subtle"
          opacity="0.7"
        />
      </svg>
    </div>
  );
}

/**
 * Block Grid - 3x3 grid with wave animation
 */
function BlocksSpinner({ size }: { size: SpinnerSize }) {
  const config = sizeConfig[size];
  const gap = size === 'sm' ? 'gap-0.5' : size === 'md' ? 'gap-1' : 'gap-1.5';

  return (
    <div className={cn('grid grid-cols-3 grid-rows-3', gap, config.container)}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
        <div
          key={i}
          className={cn(
            'rounded-sm',
            config.element,
            i % 2 === 0 ? 'bg-[var(--accent)]' : 'bg-[var(--primary)]',
            'block-wave',
            `block-wave-delay-${i}`
          )}
        />
      ))}
    </div>
  );
}

/**
 * Orbital Dots - Three dots orbiting a center
 */
function OrbitalSpinner({ size }: { size: SpinnerSize }) {
  const config = sizeConfig[size];
  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : size === 'md' ? 'h-2 w-2' : size === 'lg' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  const orbitRadius = size === 'sm' ? 'translate-x-3' : size === 'md' ? 'translate-x-5' : size === 'lg' ? 'translate-x-7' : 'translate-x-9';

  return (
    <div className={cn('relative', config.container, 'orbital-spin')}>
      {/* Center dot */}
      <div className={cn('absolute inset-0 m-auto rounded-full bg-[var(--primary)]', dotSize, 'loader-glow-subtle')} />

      {/* Orbiting dots */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={cn('absolute', orbitRadius)}>
          <div className={cn('rounded-full bg-[var(--accent)]', dotSize, 'orbital-dot orbital-dot-1')} />
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={cn('absolute -translate-y-3 translate-x-0 rotate-[120deg]')}>
          <div className={cn('rounded-full bg-[var(--primary)]', dotSize, 'orbital-dot orbital-dot-2')} />
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={cn('absolute -translate-y-3 translate-x-0 rotate-[240deg]')}>
          <div className={cn('rounded-full bg-[var(--accent)]', dotSize, 'orbital-dot orbital-dot-3')} />
        </div>
      </div>
    </div>
  );
}

/**
 * Simple Spinner - Clean circular spinner for minimal contexts
 */
function SimpleSpinner({ size }: { size: SpinnerSize }) {
  const config = sizeConfig[size];
  const borderSize = size === 'sm' ? 'border-2' : size === 'md' ? 'border-2.5' : 'border-3';

  return (
    <div
      className={cn(
        'rounded-full',
        borderSize,
        'border-[var(--border)]',
        'border-t-[var(--primary)]',
        'border-r-[var(--primary)]',
        config.container,
        'animate-spin'
      )}
      aria-hidden="true"
    />
  );
}

export default function LoadingSpinner({
  variant = 'hexagon',
  size = 'md',
  className,
  label = 'Loading',
}: LoadingSpinnerProps) {
  return (
    <div
      className={cn('flex items-center justify-center', className)}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      {variant === 'hexagon' && <HexagonSpinner size={size} />}
      {variant === 'blocks' && <BlocksSpinner size={size} />}
      {variant === 'orbital' && <OrbitalSpinner size={size} />}
      {variant === 'simple' && <SimpleSpinner size={size} />}
      <span className="sr-only">{label}...</span>
    </div>
  );
}

// Export named variants for direct import
export { HexagonSpinner, BlocksSpinner, OrbitalSpinner, SimpleSpinner };