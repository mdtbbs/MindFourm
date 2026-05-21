'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { User } from 'lucide-react';

const API_BASE = process.env.API_URL || 'http://localhost:4000';

interface MentionInputProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onInsert: (mention: string) => void;
}

interface SuggestionUser {
  id: number;
  username: string;
  avatar_url: string | null;
}

export default function MentionInput({ textareaRef, onInsert }: MentionInputProps) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<SuggestionUser[]>([]);
  const [show, setShow] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchUsers = useCallback(async (q: string) => {
    if (!q || q.length < 1) {
      setShow(false);
      setUsers([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/search?q=${encodeURIComponent(q)}&limit=10`, {
        headers: { 'X-API-Version': '1' },
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        setUsers(json.success ? json.data : []);
        setShow(true);
        setActiveIndex(0);
      }
    } catch { /* ignore */ }
  }, []);

  // Monitor textarea for @ pattern
  const checkMention = useCallback(() => {
    const ta = textareaRef?.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const text = ta.value.substring(0, pos);
    const match = text.match(/@([一-龥a-zA-Z0-9_]*)$/);
    if (match) {
      setQuery(match[1]);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fetchUsers(match[1]), 200);
    } else {
      setShow(false);
    }
  }, [textareaRef, fetchUsers]);

  const selectUser = (username: string) => {
    const ta = textareaRef?.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const text = ta.value;
    const matchPos = text.lastIndexOf('@', pos - 1);
    const before = text.substring(0, matchPos);
    const after = text.substring(pos);
    const newText = `${before}@${username} ${after}`;
    onInsert(newText);
    setShow(false);
    setQuery('');
    ta.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!show || users.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, users.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectUser(users[activeIndex].username);
    } else if (e.key === 'Escape') {
      setShow(false);
    }
  };

  return (
    <>
      {show && users.length > 0 && (
        <div className="absolute z-50 w-64 bg-white dark:bg-gray-800 border border-surface-200 dark:border-gray-700 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
          {users.map((u, i) => (
            <button
              key={u.id}
              type="button"
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors ${
                i === activeIndex ? 'bg-primary-50 dark:bg-gray-700' : ''
              }`}
              onClick={() => selectUser(u.username)}
            >
              <User className="w-4 h-4 text-surface-400" />
              <span className="text-surface-700 dark:text-gray-200 truncate">{u.username}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
