'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { RichHtmlBlock } from './rich-html-block';
import { sanitizeTrustedHtmlClient } from '@/lib/tiptap/trusted-html';
import { importHtmlDocument, HTML_IMPORT_MAX_LENGTH } from '@/lib/tiptap/import-html-document';
import { HTML_DOCUMENT_MAX_LENGTH, isHtmlDocument, sanitizeHtmlDocument } from '@/lib/tiptap/html-document';

const sanitizeHtmlBlockDraft = (html: string) => isHtmlDocument(html) ? sanitizeHtmlDocument(html) : sanitizeTrustedHtmlClient(html);

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Re-seed on open so an edit starts from the block's current markup.
  useEffect(() => {
    if (open) { setDraft(initialHtml); setError(''); }
  }, [open, initialHtml]);

  const hasEmbeddedImages = /data:image\//i.test(draft);
  const hasRemoteImages = /(?:src\s*=\s*["'](?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\/)/i.test(draft);
  const sanitized = useMemo(() => sanitizeHtmlBlockDraft(draft.replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/gi, '')), [draft]);
  const dropped = draft.trim().length > 0 && sanitized.trim().length === 0;
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const imported = await importHtmlDocument(draft);
      const safe = sanitizeHtmlBlockDraft(imported);
      if (!safe.trim()) throw new Error('HTML 清洗后没有可显示的内容');
      if (safe.length > HTML_DOCUMENT_MAX_LENGTH) throw new Error('HTML 超过 200000 字符，请精简内容');
      onSubmit(safe);
      onOpenChange(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'HTML 导入失败，请重试');
    } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => { if (!busy) onOpenChange(value); }}
      title={initialHtml ? '编辑 HTML 区块' : '插入 HTML 区块'}
      description="仅管理团队可用。支持完整 HTML、样式表和响应式排版；内容隔离显示，脚本和事件会被移除。"
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            type="button"
            disabled={busy || !draft.trim() || dropped}
            onClick={() => { void submit(); }}
          >
            {busy ? '正在导入图片…' : initialHtml ? '保存区块' : '插入区块'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium" htmlFor="html-block-input">HTML 代码</label>
          <div className="flex gap-2">
            <label className="cursor-pointer text-sm">
              导入 HTML 文件
              <input type="file" accept=".html,.htm,text/html" className="sr-only" disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  if (file.size > HTML_IMPORT_MAX_LENGTH) { setError('HTML 文件过大，最大支持 8MB'); return; }
                  try { setDraft(await file.text()); setError(''); }
                  catch { setError('无法读取 HTML 文件'); }
                }} />
            </label>
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
          disabled={busy}
          onChange={(event) => { setDraft(event.target.value); setError(''); }}
          spellCheck={false}
          rows={12}
          placeholder={'<div style="border:1px solid #ddd;border-radius:12px;padding:16px">\n  <h3>标题</h3>\n  <p>介绍文字</p>\n</div>'}
          className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs leading-relaxed outline-none focus:border-[var(--primary)]"
        />
        {(hasEmbeddedImages || hasRemoteImages) && <p className="text-sm text-[var(--text-muted)]">内嵌和外站图片将在插入时自动存入站点并替换链接；导入失败会阻止插入。每张最大 2MB，最多导入 100 张。</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
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
