'use client';

import { TextareaHTMLAttributes, useState } from 'react';
import MarkdownRenderer from './markdown-renderer';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
  textareaProps?: TextareaHTMLAttributes<HTMLTextAreaElement>;
  testId?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder,
  rows = 6,
  textareaProps,
  testId,
}: MarkdownEditorProps) {
  const [preview, setPreview] = useState(false);

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            {label}
          </label>
          <button
            type="button"
            onClick={() => setPreview(!preview)}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            {preview ? '编辑' : '预览'}
          </button>
        </div>
      )}
      {preview ? (
        <div className="min-h-[120px] p-3 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[var(--radius)]">
          <MarkdownRenderer content={value} fallback={placeholder || '暂无内容'} />
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          data-testid={testId}
          className="w-full px-4 py-2 bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-y font-mono text-sm"
          {...textareaProps}
        />
      )}
    </div>
  );
}
