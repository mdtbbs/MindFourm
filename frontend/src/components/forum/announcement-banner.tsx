'use client';

import { useState, useEffect } from 'react';
import { useSettings } from '@/lib/settings/context';

export default function AnnouncementBanner() {
  const settings = useSettings();
  const [dismissed, setDismissed] = useState(false);

  const enabled = settings.announce_enabled === 'true';
  const content = settings.announce_content || '';

  if (!enabled || !content.trim() || dismissed) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
        <p className="text-sm text-amber-800 flex-1">{content}</p>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-500 hover:text-amber-700 text-lg leading-none shrink-0"
          aria-label="关闭公告"
        >
          ×
        </button>
      </div>
    </div>
  );
}
