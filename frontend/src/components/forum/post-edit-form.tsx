'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, Pencil, Image, Bold, Italic, Link2, List, ListOrdered, Quote, Code, Heading2, Minus } from 'lucide-react';
import { categoryApi, postApi } from '@/lib/api/client';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Button } from '@/components/ui/button';
import useInlineImageUpload from '@/hooks/use-inline-image-upload';
import type { Category, Post } from '@/types';

interface PostEditFormProps {
  post: Post;
}

/**
 * Editing a published post.
 *
 * Separate from `post-form.tsx` rather than a mode flag on it: that component carries
 * the whole creation flow — draft autosave, attachment upload after the post exists, a
 * server selector — none of which applies to editing, and threading a mode through all
 * of it would put the create path at risk for no gain.
 *
 * `status` is deliberately never submitted. The API rejects the entire request with 403
 * when a non-moderator includes it, so sending the post's own current status back would
 * make every author's edit fail.
 */
export default function PostEditForm({ post }: PostEditFormProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [categoryId, setCategoryId] = useState<number | undefined>(post.category_id ?? undefined);
  const [tagsInput, setTagsInput] = useState(
    (post.tags ?? []).map((tag) => tag.name).join(', '),
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline image upload (paste / toolbar button)
  const {
    uploading: imageUploading,
    fileInputRef: imageInputRef,
    triggerImagePicker,
    handlePaste,
    handleDrop,
  } = useInlineImageUpload({
    insertMarkdown: (text) => {
      const ta = textareaRef.current;
      if (!ta) {
        setContent((prev) => prev + '\n' + text);
        return;
      }
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = content.slice(0, start);
      const after = content.slice(end);
      const needsLeading = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
      const needsTrailing = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
      const next = before + needsLeading + text + needsTrailing + after;
      setContent(next);
      requestAnimationFrame(() => {
        const cursor = start + needsLeading.length + text.length;
        ta.setSelectionRange(cursor, cursor);
      });
    },
  });

  const insertMarkdown = (prefix: string, suffix = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end);
    const replacement = prefix + (selected || '文本') + suffix;
    const newContent = content.slice(0, start) + replacement + content.slice(end);
    setContent(newContent);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorPos = start + prefix.length + (selected ? selected.length : 2);
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  };

  useEffect(() => {
    categoryApi
      .getList()
      .then(setCategories)
      // A failed category list must not block editing the text; the field just falls
      // back to "keep current".
      .catch(() => setCategories([]));
  }, []);

  const dirty =
    title !== post.title
    || content !== post.content
    || categoryId !== (post.category_id ?? undefined)
    || tagsInput !== (post.tags ?? []).map((tag) => tag.name).join(', ');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('标题不能为空');
      return;
    }
    if (!content.trim()) {
      setError('内容不能为空');
      return;
    }

    setSaving(true);
    try {
      await postApi.update(post.id, {
        // Trimmed on submit, not just validated — the previous account edit page
        // validated the trimmed value and then sent the untrimmed one.
        title: trimmedTitle,
        content,
        category_id: categoryId,
        tags: tagsInput
          .split(/[,，]+/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      // refresh() so the server-rendered detail page picks up the new content, rather
      // than navigating to a cached copy of the old one.
      router.push(`/posts/${post.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href={`/posts/${post.id}`}
        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回帖子
      </Link>

      <h1 className="text-2xl font-semibold text-[var(--text)] mb-6">编辑帖子</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="post-title" className="block text-sm font-medium text-[var(--text)] mb-2">
            标题
          </label>
          <input
            id="post-title"
            data-testid="post-edit-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          />
        </div>

        <div>
          <label htmlFor="post-category" className="block text-sm font-medium text-[var(--text)] mb-2">
            分类
          </label>
          <select
            id="post-category"
            value={categoryId ?? ''}
            onChange={(event) =>
              setCategoryId(event.target.value ? Number(event.target.value) : undefined)
            }
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <option value="">不设置分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="post-content" className="block text-sm font-medium text-[var(--text)]">
              内容
            </label>
            <button
              type="button"
              onClick={() => setPreview((value) => !value)}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)]"
            >
              {preview ? <Pencil className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {preview ? '继续编辑' : '预览'}
            </button>
          </div>

          {preview ? (
            <div className="min-h-[18rem] px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
              <MarkdownRenderer content={content} />
            </div>
          ) : (
            <>
              {/* Markdown toolbar */}
              <div className="flex items-center gap-0.5 px-3 py-2 rounded-t-lg border border-b-0 border-[var(--border)] bg-[var(--bg-elevated)] overflow-x-auto">
                <EditToolbarBtn icon={<Bold className="w-4 h-4" />} tooltip="粗体"
                  onClick={() => insertMarkdown('**', '**')} />
                <EditToolbarBtn icon={<Italic className="w-4 h-4" />} tooltip="斜体"
                  onClick={() => insertMarkdown('*', '*')} />
                <EditToolbarBtn icon={<Code className="w-4 h-4" />} tooltip="行内代码"
                  onClick={() => insertMarkdown('`', '`')} />
                <div className="w-px h-5 bg-[var(--border)] mx-1" />
                <EditToolbarBtn icon={<Heading2 className="w-4 h-4" />} tooltip="标题"
                  onClick={() => insertMarkdown('\n## ')} />
                <EditToolbarBtn icon={<Quote className="w-4 h-4" />} tooltip="引用"
                  onClick={() => insertMarkdown('\n> ')} />
                <EditToolbarBtn icon={<List className="w-4 h-4" />} tooltip="无序列表"
                  onClick={() => insertMarkdown('\n- ')} />
                <EditToolbarBtn icon={<ListOrdered className="w-4 h-4" />} tooltip="有序列表"
                  onClick={() => insertMarkdown('\n1. ')} />
                <div className="w-px h-5 bg-[var(--border)] mx-1" />
                <EditToolbarBtn icon={<Link2 className="w-4 h-4" />} tooltip="链接"
                  onClick={() => insertMarkdown('[', '](https://)')} />
                <EditToolbarBtn
                  icon={<Image className="w-4 h-4" />}
                  tooltip={imageUploading ? '图片上传中…' : '上传图片'}
                  onClick={triggerImagePicker}
                  disabled={imageUploading}
                />
                <EditToolbarBtn icon={<Minus className="w-4 h-4" />} tooltip="分割线"
                  onClick={() => insertMarkdown('\n---\n')} />
              </div>

              {/* Hidden image picker */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    const dt = new DataTransfer();
                    files.forEach((f) => dt.items.add(f));
                    handlePaste({
                      clipboardData: dt,
                      preventDefault: () => undefined,
                    } as unknown as React.ClipboardEvent);
                  }
                  if (e.target) e.target.value = '';
                }}
              />

              <textarea
                id="post-content"
                ref={textareaRef}
                data-testid="post-edit-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onPaste={handlePaste}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                rows={16}
                placeholder="使用 Markdown 格式编写帖子内容（支持粘贴图片）..."
                className="w-full px-3 py-2 rounded-b-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] font-mono text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              />
            </>
          )}
        </div>

        <div>
          <label htmlFor="post-tags" className="block text-sm font-medium text-[var(--text)] mb-2">
            标签
          </label>
          <input
            id="post-tags"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="逗号分隔"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-[var(--error)]">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !dirty} data-testid="post-edit-submit">
            {saving ? '保存中…' : '保存修改'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push(`/posts/${post.id}`)}>
            取消
          </Button>
          {!dirty && <span className="text-sm text-[var(--text-muted)]">尚未修改</span>}
        </div>
      </form>
    </div>
  );
}

function EditToolbarBtn({ icon, tooltip, onClick, disabled = false }: {
  icon: React.ReactNode; tooltip: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded text-[var(--text-secondary)]
        hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors shrink-0
        disabled:opacity-50 disabled:cursor-not-allowed">
      {icon}
    </button>
  );
}
