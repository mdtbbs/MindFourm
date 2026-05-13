'use client';

import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  className?: string;
  queryParams?: Record<string, string | number>;
}

export default function Pagination({
  currentPage,
  totalPages,
  basePath,
  className = '',
  queryParams = {},
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const buildUrl = (page: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav className={`flex items-center justify-center space-x-1 ${className}`}>
      {currentPage > 1 && (
        <Link
          href={buildUrl(currentPage - 1)}
          className="px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 rounded"
        >
          上一页
        </Link>
      )}
      {Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter((page) => {
          if (page === 1 || page === totalPages) return true;
          if (Math.abs(page - currentPage) <= 2) return true;
          return false;
        })
        .map((page, idx, arr) => {
          const prev = arr[idx - 1];
          const showEllipsis = prev && page - prev > 1;

          return (
            <span key={page} className="inline-flex items-center">
              {showEllipsis && <span className="px-2 text-surface-400">...</span>}
              {page === currentPage ? (
                <span className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded font-medium">
                  {page}
                </span>
              ) : (
                <Link
                  href={buildUrl(page)}
                  className="px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 rounded"
                >
                  {page}
                </Link>
              )}
            </span>
          );
        })}
      {currentPage < totalPages && (
        <Link
          href={buildUrl(currentPage + 1)}
          className="px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 rounded"
        >
          下一页
        </Link>
      )}
    </nav>
  );
}
