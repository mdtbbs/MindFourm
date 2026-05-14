'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import { bookmarkApi } from '@/lib/api/client';
import Button from '@/components/ui/button';
import Alert from '@/components/ui/alert';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';

interface BookmarkButtonProps {
  postId: number;
}

export default function BookmarkButton({ postId }: BookmarkButtonProps) {
  const { user } = useAuth();
  const [bookmarked, setBookmarked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check bookmark status on mount (only for authenticated users)
  useEffect(() => {
    if (!user) return;
    bookmarkApi.check(postId)
      .then((res) => setBookmarked(res.bookmarked))
      .catch(() => {
        // Silently ignore check failures
      });
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
      setError(err instanceof Error ? err.message : '操作失败');
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
        disabled={loading}
        className={bookmarked ? 'text-amber-600' : 'text-surface-600'}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : bookmarked ? (
          <BookmarkCheck className="w-4 h-4 mr-1" />
        ) : (
          <Bookmark className="w-4 h-4 mr-1" />
        )}
        {bookmarked ? '已收藏' : '收藏'}
      </Button>
      {error && (
        <Alert type="error" message={error} />
      )}
    </div>
  );
}
