'use client';

import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  className?: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  basePath,
  className = '',
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const getPageUrl = (page: number) =>
    page === 1 ? basePath : `${basePath}?page=${page}`;

  return (
    <nav className={`flex items-center justify-center space-x-1 ${className}`}>
      {currentPage > 1 && (
        <Link
          href={getPageUrl(currentPage - 1)}
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
                  href={getPageUrl(page)}
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
          href={getPageUrl(currentPage + 1)}
          className="px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 rounded"
        >
          下一页
        </Link>
      )}
    </nav>
  );
}
