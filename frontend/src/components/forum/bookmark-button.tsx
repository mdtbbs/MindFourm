'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import { bookmarkApi } from '@/lib/api/client';
import Button from '@/components/ui/button';
import Alert from '@/components/ui/alert';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

interface BookmarkButtonProps {
  postId: number;
}

export default function BookmarkButton({ postId }: BookmarkButtonProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [bookmarked, setBookmarked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check bookmark status on mount (only for authenticated users)
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    setChecking(true);
    bookmarkApi.check(postId)
      .then((res) => { if (!cancelled) setBookmarked(res.bookmarked); })
      .catch(() => {
        // Failing to read the current state is not worth interrupting the user
        // over; the button just starts un-bookmarked. (This branch previously
        // scheduled `setError(null)` without ever setting an error — a no-op.)
      })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [postId, user]);

  if (!user) return null;

  async function handleToggle() {
    setLoading(true);
    setError(null);
    // Optimistic toggle
    const previousState = bookmarked;
    setBookmarked(!bookmarked);

    try {
      if (previousState) {
        await bookmarkApi.remove(postId);
      } else {
        await bookmarkApi.add(postId);
      }
    } catch (err) {
      setBookmarked(previousState);
      setError(err instanceof Error ? err.message : t('bookmark.saveFailed'));
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        disabled={loading || checking}
        aria-label={bookmarked ? t('bookmark.remove') : t('bookmark.add')}
        aria-pressed={bookmarked}
        className={bookmarked ? 'text-amber-600' : 'text-surface-600'}
      >
        {loading || checking ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : bookmarked ? (
          <BookmarkCheck className="w-4 h-4 mr-1" />
        ) : (
          <Bookmark className="w-4 h-4 mr-1" />
        )}
        {bookmarked ? t('bookmark.saved') : t('bookmark.add')}
      </Button>
      {error && (
        <Alert type="error" message={error} />
      )}
    </div>
  );
}
