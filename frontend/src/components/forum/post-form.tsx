'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { postApi, categoryApi, tagApi } from '@/lib/api/client';
import { CreatePostInput, Category, Tag, Attachment } from '@/types';
import Button from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import Alert from '@/components/ui/alert';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import FileUpload from '@/components/forum/file-upload';
import AttachmentList from '@/components/forum/attachment-list';
import { useDraft, useDraftAutoSave } from '@/hooks/use-draft';
import {
  Eye, Edit3, Bold, Italic, Link2, List, ListOrdered,
  Quote, Code, Heading2, Image, Minus, ChevronDown, Clock, Send, Save,
} from 'lucide-react';

type EditorTab = 'write' | 'preview';

export default function PostForm() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');

  // UI state
  const [editorTab, setEditorTab] = useState<EditorTab>('write');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdPostId, setCreatedPostId] = useState<number | null>(null);
  const [createdPostStatus, setCreatedPostStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Reference data
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Validation errors
  const [titleError, setTitleError] = useState('');
  const [contentError, setContentError] = useState('');

  // Draft
  const draft = useDraft('post');
  const draftValues = { title, content, categoryId, tagsInput, status };
  useDraftAutoSave(draftValues, draft.save);

  // Load categories & tags
  useEffect(() => {
    let cancelled = false;
    Promise.all([categoryApi.getList(), tagApi.getList()])
      .then(([cats, tgs]) => {
        if (!cancelled) { setCategories(cats); setTags(tgs); }
      })
      .catch(() => { if (!cancelled) console.error('Failed to load categories/tags'); });
    return () => { cancelled = true; };
  }, []);

  // Restore draft
  useEffect(() => {
    const saved = draft.load();
    if (saved) {
      if (saved.title) setTitle(saved.title as string);
      if (saved.content) setContent(saved.content as string);
      if (saved.categoryId) setCategoryId(saved.categoryId as string);
      if (saved.tagsInput) setTagsInput(saved.tagsInput as string);
      if (saved.status) setStatus(saved.status as 'draft' | 'published');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Intentionally no auto-redirect after creating a post.
  //
  // The attachment uploader only renders once `createdPostId` is set, but a
  // published post used to navigate away the moment it was created — so the
  // attachment step was unreachable in the normal flow. The user now gets an
  // explicit link once the post exists (see the panel below).

  // ── Helpers ──────────────────────────────────────────────
  const parseTags = (): string[] =>
    tagsInput
      .split(/[,，]+/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => {
        const matched = tags.find(tag => tag.name.toLowerCase() === t.toLowerCase());
        return matched ? matched.slug : t.toLowerCase().replace(/\s+/g, '-');
      });

  const validate = (): boolean => {
    let valid = true;
    if (!title.trim()) { setTitleError('请输入标题'); valid = false; } else { setTitleError(''); }
    if (!content.trim()) { setContentError('请输入内容'); valid = false; } else { setContentError(''); }
    return valid;
  };

  // ── Markdown toolbar helpers ─────────────────────────────
  const insertMarkdown = (prefix: string, suffix = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end);
    const replacement = prefix + (selected || '文本') + suffix;
    const newContent = content.slice(0, start) + replacement + content.slice(end);
    setContent(newContent);
    setEditorTab('write');
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      const cursorPos = start + prefix.length + (selected ? selected.length : 2);
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  };

  // ── Submit ───────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const input: CreatePostInput = {
        title: title.trim(),
        content: content.trim(),
        category_id: categoryId ? Number(categoryId) : undefined,
        tags: parseTags(),
        status,
      };
      const post = await postApi.create(input);
      draft.clear();
      setCreatedPostId(post.id);
      setCreatedPostStatus(post.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发帖失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading / Auth ───────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-surface-500 text-sm">加载中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Alert type="warning" message="请先登录后再发帖" className="mb-4" />
        <div className="text-center">
          <a href={`/login?redirect=${encodeURIComponent(pathname || '/posts/new')}`}
             className="text-primary-600 hover:text-primary-700 font-medium">
            前往登录 →
          </a>
        </div>
      </div>
    );
  }

  // ── Pending moderation banner ────────────────────────────
  if (createdPostStatus === 'pending') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
            <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-200 mb-2">
            帖子已提交，等待审核
          </h2>
          <p className="text-amber-700 dark:text-amber-300 mb-6 leading-relaxed">
            您的帖子正在等待管理员审核。<br />
            审核通过后将会自动发布，请耐心等待。<br />
            如有疑问请联系管理组。
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="secondary" onClick={() => router.push('/')}>返回首页</Button>
            <Button onClick={() => router.push(`/posts/${createdPostId}`)}>查看帖子</Button>
          </div>
        </div>
      </div>
    );
  }

  const categoryOptions = [
    { value: '', label: '选择分类（可选）' },
    ...categories.map(c => ({ value: String(c.id), label: c.name })),
  ];

  const availableTagNames = tags.map(t => t.name).join('、');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* ── Header ──────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-gray-100">发布新帖子</h1>
        <p className="text-sm text-surface-500 dark:text-gray-400 mt-1">
          使用 Markdown 格式编写您的内容
        </p>
      </div>

      {/* ── Alerts ──────────────────────────────────── */}
      {error && <Alert type="error" message={error} className="mb-4" />}
      {draft.hasDraft && (
        <Alert type="info" message="已自动恢复上次未保存的草稿" className="mb-4" />
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Title ─────────────────────────────────── */}
        <div>
          <input
            type="text"
            value={title}
            onChange={e => { setTitle(e.target.value); if (titleError) setTitleError(''); }}
            placeholder="请输入帖子标题"
            maxLength={200}
            className={`w-full text-xl font-semibold px-4 py-3 bg-white dark:bg-gray-800 border rounded-xl
              focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition
              text-surface-900 dark:text-gray-100 placeholder:text-surface-400 dark:placeholder:text-gray-500
              ${titleError ? 'border-red-400' : 'border-surface-200 dark:border-gray-700'}`}
          />
          {titleError && <p className="text-sm text-red-500 mt-1.5 ml-1">{titleError}</p>}
        </div>

        {/* ── Editor card ───────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-surface-200 dark:border-gray-700 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center gap-0.5 px-3 py-2 border-b border-surface-200 dark:border-gray-700 bg-surface-50 dark:bg-gray-800/50 overflow-x-auto">
            <ToolbarBtn icon={<Bold className="w-4 h-4" />} tooltip="粗体"
              onClick={() => insertMarkdown('**', '**')} />
            <ToolbarBtn icon={<Italic className="w-4 h-4" />} tooltip="斜体"
              onClick={() => insertMarkdown('*', '*')} />
            <ToolbarBtn icon={<Code className="w-4 h-4" />} tooltip="行内代码"
              onClick={() => insertMarkdown('`', '`')} />
            <div className="w-px h-5 bg-surface-200 dark:border-gray-600 mx-1" />
            <ToolbarBtn icon={<Heading2 className="w-4 h-4" />} tooltip="标题"
              onClick={() => insertMarkdown('\n## ')} />
            <ToolbarBtn icon={<Quote className="w-4 h-4" />} tooltip="引用"
              onClick={() => insertMarkdown('\n> ')} />
            <ToolbarBtn icon={<List className="w-4 h-4" />} tooltip="无序列表"
              onClick={() => insertMarkdown('\n- ')} />
            <ToolbarBtn icon={<ListOrdered className="w-4 h-4" />} tooltip="有序列表"
              onClick={() => insertMarkdown('\n1. ')} />
            <div className="w-px h-5 bg-surface-200 dark:border-gray-600 mx-1" />
            <ToolbarBtn icon={<Link2 className="w-4 h-4" />} tooltip="链接"
              onClick={() => insertMarkdown('[', '](https://)')} />
            <ToolbarBtn icon={<Image className="w-4 h-4" />} tooltip="图片"
              onClick={() => insertMarkdown('![alt](', ')')} />
            <ToolbarBtn icon={<Minus className="w-4 h-4" />} tooltip="分割线"
              onClick={() => insertMarkdown('\n---\n')} />
          </div>

          {/* Tabs: Write / Preview */}
          <div className="flex border-b border-surface-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setEditorTab('write')}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${editorTab === 'write'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-gray-300'}`}>
              <Edit3 className="w-4 h-4" />
              编写
            </button>
            <button
              type="button"
              onClick={() => setEditorTab('preview')}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${editorTab === 'preview'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-gray-300'}`}>
              <Eye className="w-4 h-4" />
              预览
            </button>
          </div>

          {/* Editor area */}
          {editorTab === 'write' ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => { setContent(e.target.value); if (contentError) setContentError(''); }}
              placeholder="使用 Markdown 格式编写帖子内容..."
              className={`w-full min-h-[280px] px-4 py-3 resize-y outline-none
                bg-white dark:bg-gray-800 text-surface-900 dark:text-gray-100
                placeholder:text-surface-400 dark:placeholder:text-gray-500 font-mono text-sm leading-relaxed
                ${contentError ? 'ring-1 ring-red-400' : ''}`}
            />
          ) : (
            <div className="min-h-[280px] p-4 overflow-auto">
              {content.trim() ? (
                <MarkdownRenderer content={content} />
              ) : (
                <p className="text-surface-400 dark:text-gray-500 italic">暂无内容，请先在编写标签页中输入</p>
              )}
            </div>
          )}

          {contentError && (
            <div className="px-4 pb-3">
              <p className="text-sm text-red-500">{contentError}</p>
            </div>
          )}
        </div>

        {/* ── Metadata row ──────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-1.5">
              分类
            </label>
            <Select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              options={categoryOptions}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-1.5">
              标签
            </label>
            <Input
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="逗号分隔"
              maxLength={200}
            />
            {availableTagNames && (
              <p className="text-xs text-surface-400 mt-1 truncate" title={availableTagNames}>
                可用：{availableTagNames}
              </p>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-1.5">
              状态
            </label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="status" value="published"
                  checked={status === 'published'} onChange={() => setStatus('published')}
                  className="text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-surface-700 dark:text-gray-300">发布</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="status" value="draft"
                  checked={status === 'draft'} onChange={() => setStatus('draft')}
                  className="text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-surface-700 dark:text-gray-300">草稿</span>
              </label>
            </div>
          </div>
        </div>

        {/* ── Attachments (available once the post exists) ── */}
        {createdPostId && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-surface-200 dark:border-gray-700 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-surface-700 dark:text-gray-300">附件</h3>
              <Link
                href={`/posts/${createdPostId}`}
                className="text-sm text-primary-600 hover:underline"
              >
                {createdPostStatus === 'pending' ? '查看待审核帖子' : '查看帖子'} →
              </Link>
            </div>
            <p className="mb-3 text-xs text-surface-500 dark:text-gray-400">
              帖子已创建，可以继续添加附件，完成后点击上方链接查看。
            </p>
            <FileUpload postId={createdPostId}
              onUploaded={newAtts => setAttachments(prev => [...prev, ...newAtts])} />
            {attachments.length > 0 && (
              <div className="mt-3"><AttachmentList attachments={attachments} /></div>
            )}
          </div>
        )}

        {/* ── Actions ───────────────────────────────── */}
        <div className="flex items-center justify-between pt-4 border-t border-surface-200 dark:border-gray-700">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            取消
          </Button>
          <div className="flex gap-3">
            <Button type="button" variant="secondary"
              onClick={() => { draft.save(draftValues); }}>
              <Save className="w-4 h-4 inline mr-1" />
              存草稿
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                '提交中...'
              ) : status === 'draft' ? (
                <>
                  <Save className="w-4 h-4 inline mr-1" />
                  保存草稿
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 inline mr-1" />
                  发布帖子
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Toolbar button ───────────────────────────────────────
function ToolbarBtn({ icon, tooltip, onClick }: {
  icon: React.ReactNode; tooltip: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      className="p-1.5 rounded text-surface-500 dark:text-gray-400
        hover:text-surface-700 dark:hover:text-gray-200
        hover:bg-surface-100 dark:hover:bg-gray-700 transition-colors shrink-0">
      {icon}
    </button>
  );
}
