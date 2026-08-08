'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Resource } from '@/types';

interface ResourceCarouselProps {
  resources: Resource[];
}

export default function ResourceCarousel({ resources }: ResourceCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (resources.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % resources.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [resources.length]);

  if (resources.length === 0) return null;

  const current = resources[currentIndex];

  const goNext = () => {
    setCurrentIndex((prev) => (prev + 1) % resources.length);
  };

  const goPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + resources.length) % resources.length);
  };

  return (
    <div className="relative rounded-lg border border-[var(--border)] bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-secondary)] p-4 overflow-hidden">
      <Link
        href={`/resources/${current.id}`}
        className="block hover:opacity-90 transition-opacity"
      >
        <div className="flex gap-4">
          {/* Resource icon */}
          <div className="flex-shrink-0">
            <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] flex items-center justify-center shadow-lg">
              <span className="text-4xl">📦</span>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base mb-1 text-[var(--text)] line-clamp-1">
              {current.title}
            </h3>
            {current.description && (
              <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-2">
                {current.description}
              </p>
            )}
            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
              <span>👤 {current.username}</span>
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                {current.rating_average?.toFixed(1) || '0.0'}
              </span>
              <span>⬇ {current.download_count.toLocaleString()}</span>
              {current.version && (
                <span className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                  v{current.version}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Navigation buttons */}
      {resources.length > 1 && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[var(--bg-card)]/80 hover:bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center transition-colors"
            aria-label="上一个"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[var(--bg-card)]/80 hover:bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center transition-colors"
            aria-label="下一个"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Dots indicator */}
          <div className="flex justify-center gap-1.5 mt-3">
            {resources.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  index === currentIndex
                    ? 'bg-[var(--primary)] w-4'
                    : 'bg-[var(--text-muted)]/30 hover:bg-[var(--text-muted)]/50'
                }`}
                aria-label={`跳转到第 ${index + 1} 个`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
