'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[var(--text)] mb-2">Something went wrong</h2>
        <p className="text-[var(--text-secondary)] mb-4">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-dark)] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}