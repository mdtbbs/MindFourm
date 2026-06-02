import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[var(--text)] mb-2">Page not found</h2>
        <p className="text-[var(--text-secondary)] mb-4">The page you're looking for doesn't exist.</p>
        <Link href="/" className="px-4 py-2 bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-dark)] transition-colors">
          Back to home
        </Link>
      </div>
    </div>
  );
}