'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { RichHtmlBlock } from './rich-html-block';
import { sanitizeTrustedHtmlClient } from '@/lib/tiptap/trusted-html';

/**
 * Insert / edit panel for one HTML block.
 *
 * The preview is the real renderer, so what the author sees here is what a
 * reader gets — including anything the sanitizer drops. The sanitized result is
 * also what gets stored, because the fragment is bounded twice: once here (so
 * the preview and the saved value cannot disagree) and once on the server (which
 * is the pass that actually protects other readers).
 */

const STARTER = `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;background-color:#f9fafb">
  <h3 style="margin:0 0 8px">资源简介</h3>
  <p style="margin:0 0 12px">在这里写介绍，可以加 <strong>粗体</strong>、<a href="https://example.com">链接</a> 和排版样式。</p>
  <img src="/uploads/example.png" alt="示例图片" style="max-width:100%;border-radius:8px" />
</div>`;

export interface HtmlBlockDialogProps {
  open: boolean;
  initialHtml?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (html: string) => void;
}

export function HtmlBlockDialog({ open, initialHtml = '', onOpenChange, onSubmit }: HtmlBlockDialogProps) {
  const [draft, setDraft] = useState(initialHtml);
  const [showPreview, setShowPreview] = useState(true);

  // Re-seed on open so an edit starts from the block's current markup.
  useEffect(() => {
    if (open) setDraft(initialHtml);
  }, [open, initialHtml]);

  const sanitized = useMemo(() => sanitizeTrustedHtmlClient(draft), [draft]);
  const dropped = draft.trim().length > 0 && sanitized.trim().length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialHtml ? '编辑 HTML 区块' : '插入 HTML 区块'}
      description="仅管理团队可用。写入前会按白名单清洗，脚本、事件属性和可覆盖页面的样式会被移除。"
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            type="button"
            disabled={!sanitized.trim()}
            onClick={() => { onSubmit(sanitized); onOpenChange(false); }}
          >
            {initialHtml ? '保存区块' : '插入区块'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium" htmlFor="html-block-input">HTML 代码</label>
          <div className="flex gap-2">
            {!draft.trim() && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(STARTER)}>插入示例</Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPreview((value) => !value)}>
              {showPreview ? '隐藏预览' : '显示预览'}
            </Button>
          </div>
        </div>
        <textarea
          id="html-block-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          rows={12}
          placeholder={'<div style="border:1px solid #ddd;border-radius:12px;padding:16px">\n  <h3>标题</h3>\n  <p>介绍文字</p>\n</div>'}
          className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs leading-relaxed outline-none focus:border-[var(--primary)]"
        />
        {dropped && (
          <p className="text-xs text-amber-600" role="alert">
            这段内容清洗后为空 —— 检查标签是否在白名单内，或改成普通正文。
          </p>
        )}
        {showPreview && sanitized.trim() && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <p className="mb-2 text-xs text-[var(--text-muted)]">预览（清洗后）</p>
            <RichHtmlBlock html={sanitized} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default HtmlBlockDialog;
