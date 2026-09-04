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
    // `basePath` may already carry a query string (e.g. `/users/5?tab=posts`).
    // Appending another `?` produced `/users/5?tab=posts?page=2`, where `page`
    // never parsed and `tab` became "posts?page=2".
    const [pathname, existingQuery = ''] = basePath.split('?');
    const params = new URLSearchParams(existingQuery);

    if (page > 1) {
      params.set('page', String(page));
    } else {
      params.delete('page');
    }

    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }

    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <nav
      aria-label="分页"
      className={`flex items-center justify-center space-x-1 ${className}`}
    >
      {currentPage > 1 && (
        <Link
          href={buildUrl(currentPage - 1)}
          // rel prev/next tells crawlers these pages form one sequence rather than a
          // set of unrelated near-duplicates.
          rel="prev"
          className="px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded-lg"
          aria-label="上一页"
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
                <span
                  aria-current="page"
                  className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg font-medium"
                >
                  {page}
                </span>
              ) : (
                <Link
                  href={buildUrl(page)}
                  className="px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded-lg"
                  aria-label={`第${page}页`}
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
          rel="next"
          className="px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded-lg"
          aria-label="下一页"
        >
          下一页
        </Link>
      )}
    </nav>
  );
}
