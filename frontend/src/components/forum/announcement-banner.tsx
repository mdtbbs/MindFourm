'use client';

import { useState, useEffect } from 'react';
import { useSettings } from '@/lib/settings/context';

const DISMISSED_KEY = 'announcement_dismissed_id';

/**
 * Stable short id for an announcement's text.
 *
 * Dismissal used to be stored under a single boolean key, so closing one
 * announcement suppressed every future one forever. Keying on the content means a
 * new announcement shows again while the dismissed one stays hidden.
 */
function announcementId(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash << 5) - hash + content.charCodeAt(i);
    hash |= 0; // force int32
  }
  return String(hash);
}

export default function AnnouncementBanner() {
  const settings = useSettings();
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  // Avoids briefly showing an already-dismissed banner before localStorage is read.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissedId(localStorage.getItem(DISMISSED_KEY));
    }
    setReady(true);
  }, []);

  const enabled = settings.announce_enabled === 'true';
  const content = settings.announce_content || '';
  const trimmed = content.trim();
  const currentId = trimmed ? announcementId(trimmed) : null;

  if (!ready || !enabled || !currentId || dismissedId === currentId) return null;

  const handleDismiss = () => {
    setDismissedId(currentId);
    localStorage.setItem(DISMISSED_KEY, currentId);
  };

  return (
    <div className="bg-amber-50 border border-amber-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
        <p className="text-sm text-amber-800 flex-1">{content}</p>
        <button
          onClick={handleDismiss}
          className="text-amber-500 hover:text-amber-700 text-lg leading-none shrink-0"
          aria-label="关闭公告"
        >
          ×
        </button>
      </div>
    </div>
  );
}
