'use client';

import LoadingSpinner from './loading-spinner';
import { cn } from '@/lib/utils';

interface PageLoaderProps {
  variant?: 'hexagon' | 'blocks' | 'orbital';
  size?: 'lg' | 'xl';
  text?: string;
  showText?: boolean;
  className?: string;
}

/**
 * Full-page loading component for route transitions
 * Displays centered Mindustry-themed animation with optional loading text
 */
export default function PageLoader({
  variant = 'hexagon',
  size = 'xl',
  text = 'Loading',
  showText = true,
  className,
}: PageLoaderProps) {
  return (
    <div
      className={cn(
        'flex min-h-screen flex-col items-center justify-center',
        'bg-[var(--bg)]',
        className
      )}
    >
      {/* Loading animation container */}
      <div className="relative fade-in-up">
        {/* Glow backdrop */}
        <div
          className={cn(
            'absolute inset-0 m-auto',
            size === 'lg' ? 'h-20 w-20' : 'h-24 w-24',
            'bg-[var(--primary)] opacity-10 blur-xl rounded-full'
          )}
          aria-hidden="true"
        />

        {/* Spinner */}
        <LoadingSpinner variant={variant} size={size} label={text} />
      </div>

      {/* Loading text */}
      {showText && (
        <div className="mt-6 fade-in-up fade-in-up-delay">
          <span
            className={cn(
              'text-sm font-medium tracking-wide',
              'text-[var(--text-secondary)]'
            )}
          >
            {text}
            <span className="inline-flex ml-1">
              <span className="animate-pulse">.</span>
              <span className="animate-pulse delay-100">.</span>
              <span className="animate-pulse delay-200">.</span>
            </span>
          </span>
        </div>
      )}
    </div>
  );
}