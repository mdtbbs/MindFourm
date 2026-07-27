'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import type { ReactionTargetType } from '@/lib/api/reactions';
import { useReactionStore, useReactions } from '@/store/reaction-store';
import { useUserStore } from '@/store/user-store';
import { useToastStore } from '@/store/toast-store';

interface ReactionBarProps {
  targetType: ReactionTargetType;
  targetId: number;
  className?: string;
}

/**
 * Emoji reactions for a post or reply.
 *
 * The picker expands inline rather than in a floating popover. A popover here would
 * need the full modal treatment (focus trap, scroll lock, an overlay) to be keyboard-
 * accessible, and none of that is appropriate for a six-button picker that sits inside
 * a reply card — an absolutely positioned layer would also be clipped by the card's
 * own overflow. Inline expansion is keyboard-reachable by construction; Escape and
 * selecting an emoji both close it and return focus to the toggle.
 *
 * Aggregates come from the store, which coalesces the mounts of every bar on the page
 * into one burst of requests. This component never fetches on its own.
 */
export default function ReactionBar({ targetType, targetId, className = '' }: ReactionBarProps) {
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);
  const showError = useToastStore((state) => state.showError);
  const showInfo = useToastStore((state) => state.showInfo);

  const reactions = useReactions(targetType, targetId);
  const emojis = useReactionStore((state) => state.emojis);
  const ensureReactions = useReactionStore((state) => state.ensureReactions);
  const ensureEmojis = useReactionStore((state) => state.ensureEmojis);
  const toggleReaction = useReactionStore((state) => state.toggleReaction);

  const [pickerOpen, setPickerOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerId = `reaction-picker-${targetType}-${targetId}`;

  useEffect(() => {
    ensureReactions(targetType, targetId);
  }, [ensureReactions, targetType, targetId]);

  // Move focus into the picker on open so keyboard users reach the emojis without
  // tabbing, and so Escape has somewhere obvious to return from.
  useEffect(() => {
    if (!pickerOpen) return;
    pickerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [pickerOpen]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    toggleRef.current?.focus();
  }, []);

  const openPicker = () => {
    // Deferred to the first open so a page full of bars does not each ask for the
    // whitelist; the store deduplicates, but not fetching at all is cheaper still.
    ensureEmojis();
    setPickerOpen(true);
  };

  const react = async (emoji: string) => {
    if (!isAuthenticated) {
      // The bar stays visible and clickable while signed out — same call as LikeButton.
      // Hiding it would remove the only hint that reactions exist, and the counts
      // themselves are public.
      showInfo('请登录后添加表情反应');
      return;
    }

    try {
      await toggleReaction(targetType, targetId, emoji);
    } catch (err) {
      showError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    }
  };

  const selectFromPicker = (emoji: string) => {
    closePicker();
    void react(emoji);
  };

  const reactedEmojis = new Set(reactions.filter((item) => item.reacted).map((item) => item.emoji));

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
      onKeyDown={(event) => {
        if (!pickerOpen || event.key !== 'Escape') return;
        // Stopped so an Escape aimed at the picker does not also close an enclosing
        // dialog. Handled on the wrapper rather than the picker itself because the
        // toggle keeps focus when the picker is opened with the mouse.
        event.stopPropagation();
        closePicker();
      }}
    >
      {/* Zero-count reactions are absent from the aggregate, so nothing to filter here. */}
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => void react(reaction.emoji)}
          aria-pressed={reaction.reacted}
          aria-label={`${reaction.emoji} ${reaction.count} 个反应`}
          title={reaction.reacted ? '取消这个反应' : '也用这个表情反应'}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
            reaction.reacted
              ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
              : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--primary)]'
          }`}
        >
          <span aria-hidden="true">{reaction.emoji}</span>
          <span className="text-xs font-medium tabular-nums">{reaction.count}</span>
        </button>
      ))}

      <button
        ref={toggleRef}
        type="button"
        onClick={() => (pickerOpen ? closePicker() : openPicker())}
        aria-expanded={pickerOpen}
        aria-controls={pickerId}
        aria-label="添加表情反应"
        title="添加表情反应"
        data-testid={`reaction-add-${targetType}-${targetId}`}
        className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] p-1 text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      >
        <SmilePlus className="h-4 w-4" />
      </button>

      {pickerOpen && (
        <div
          ref={pickerRef}
          id={pickerId}
          role="group"
          aria-label="选择表情"
          className="flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-0.5"
        >
          {emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => selectFromPicker(emoji)}
              aria-pressed={reactedEmojis.has(emoji)}
              aria-label={emoji}
              className={`rounded-full px-1.5 py-0.5 text-base transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                reactedEmojis.has(emoji) ? 'bg-[var(--primary)]/10' : ''
              }`}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
