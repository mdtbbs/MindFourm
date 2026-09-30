"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { uploadImage, isUploadableImage } from "@/lib/tiptap/upload-image";
import { attachmentApi, customEmojiApi, userApi } from "@/lib/api/client";
import { useToastStore } from "@/store/toast-store";
import { normalizeEditorContent } from "@/lib/editor-content";
import { siteProfile } from "@/config/site-profile";
import { projectRichContentToMarkdown } from "@/lib/tiptap/rich-content-projection";
import { createTiptapEditorExtensions } from "@/lib/tiptap/editor-extensions";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Type,
  Quote,
  Code,
  Code2,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
  Minus,
  Undo2,
  Redo2,
  Loader2,
  ListTodo,
  Paperclip,
  Film,
  Underline as UnderlineIcon,
  Smile,
} from "lucide-react";

function parseRichEmbed(raw: string): Record<string, unknown> | null {
  if (!raw || raw.length > 4096) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (!['https:'].includes(url.protocol) || url.username || url.password) return null;
  const providers = siteProfile.videoProviders as readonly string[];
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (providers.includes('direct') && /\.(?:mp4|webm)$/i.test(url.pathname)) {
    return { type: 'video', attrs: { provider: 'direct', src: url.href, title: '' } };
  }
  if (providers.includes('youtube') && ['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) {
    const id = host === 'youtu.be' ? url.pathname.slice(1).split('/')[0] : url.searchParams.get('v') || url.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/)?.[1];
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return { type: 'video', attrs: { provider: 'youtube', videoId: id, title: '' } };
  }
  if (providers.includes('bilibili') && (host === 'bilibili.com' || host.endsWith('.bilibili.com'))) {
    const id = url.pathname.match(/\/video\/(BV[0-9A-Za-z]{10}|av[1-9][0-9]{0,14})/)?.[1] || url.searchParams.get('bvid');
    if (id && /^(?:BV[0-9A-Za-z]{10}|av[1-9][0-9]{0,14})$/.test(id)) return { type: 'video', attrs: { provider: 'bilibili', videoId: id, title: '' } };
  }
  if (providers.includes('douyin') && (host === 'douyin.com' || host.endsWith('.douyin.com'))) {
    const id = url.pathname.match(/\/video\/(\d{5,32})/)?.[1];
    if (id) return { type: 'video', attrs: { provider: 'douyin', videoId: id, title: '' } };
  }
  const postId = Number(url.pathname.match(/^\/posts\/(\d+)(?:\/|$)/)?.[1]);
  const replyId = Number(url.hash.match(/^#reply-(\d+)$/)?.[1]);
  const allowedDomains = [siteProfile.domain, 'www.' + siteProfile.domain];
  if (postId > 0 && (typeof window === 'undefined' || url.hostname === window.location.hostname || allowedDomains.includes(url.hostname))) {
    return replyId > 0
      ? { type: 'replyQuote', attrs: { postId, replyId } }
      : { type: 'postQuote', attrs: { postId } };
  }
  return null;
}

/* ─── Types ─────────────────────────────────────────────── */

interface TiptapEditorProps {
  /** Markdown string — the editor reads this on mount and when it changes externally. */
  value: string;
  /** Called with the current Markdown string whenever content changes. */
  onChange: (markdown: string) => void;
  /** Canonical Tiptap / ProseMirror source used by new API writes. */
  jsonValue?: Record<string, unknown> | null;
  onJsonChange?: (document: Record<string, unknown>) => void;
  placeholder?: string;
  /** CSS min-height for the editor area. */
  minHeight?: string;
  /** Compact toolbar for reply editors (fewer buttons). */
  compact?: boolean;
  /** Enable paste/drop/button image upload. */
  imageUpload?: boolean;
  /** Shared schema, with presentation restrictions for resource descriptions. */
  context?: 'post' | 'reply' | 'resource';
  /** Applied to the editable surface for E2E/tests. */
  testId?: string;
  /** Stable ID for the editable surface, so an external <label> can target it. */
  id?: string;
  /** Accessible name when there is no external label. */
  ariaLabel?: string;
  className?: string;
}

type MentionUser = Awaited<ReturnType<typeof userApi.search>>[number];

interface MentionSuggestion {
  query: string;
  from: number;
  top: number;
  left: number;
}

interface FailedImageUpload {
  file: File;
  message: string;
}

/* ─── Main component ────────────────────────────────────── */

export default function TiptapEditor({
  value,
  onChange,
  jsonValue,
  onJsonChange,
  placeholder = "输入正文内容…",
  minHeight = "200px",
  compact = false,
  imageUpload = false,
  context = 'post',
  testId,
  id,
  ariaLabel = "富文本编辑器",
  className = "",
}: TiptapEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [failedUploads, setFailedUploads] = useState<FailedImageUpload[]>([]);
  const [mention, setMention] = useState<MentionSuggestion | null>(null);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const showError = useToastStore((s) => s.showError);
  // Track whether a value change comes from the editor itself (to avoid re-setting content)
  const internalUpdateRef = useRef(false);
  const lastExternalValueRef = useRef(value);
  // Ref for the image upload function — editorProps captures this at creation time,
  // but the actual handler is defined later (depends on `editor`). The ref bridges
  // the gap so paste/drop always calls the latest version.
  const imageUploadFnRef = useRef<(files: File[]) => Promise<void>>();
  const imageUploadQueueRef = useRef<File[]>([]);
  const imageUploadProcessingRef = useRef(false);
  const mentionUpdateFnRef = useRef<(activeEditor: Editor) => void>();
  const mentionKeydownFnRef = useRef<(event: KeyboardEvent) => boolean>();
  const richPasteInsertFnRef = useRef<(node: Record<string, unknown>) => void>();
  const mentionRequestRef = useRef(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const syncKeyboardOffset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty('--editor-visual-viewport-inset', `${inset}px`);
    };
    syncKeyboardOffset();
    viewport.addEventListener('resize', syncKeyboardOffset);
    viewport.addEventListener('scroll', syncKeyboardOffset);
    window.addEventListener('resize', syncKeyboardOffset);
    return () => {
      viewport.removeEventListener('resize', syncKeyboardOffset);
      viewport.removeEventListener('scroll', syncKeyboardOffset);
      window.removeEventListener('resize', syncKeyboardOffset);
    };
  }, []);

  const editor = useEditor({
    extensions: createTiptapEditorExtensions(placeholder),
    content: jsonValue || normalizeEditorContent(value),
    onUpdate({ editor: e }) {
      internalUpdateRef.current = true;
      const json = e.getJSON() as Record<string, unknown>;
      const md = normalizeEditorContent(projectRichContentToMarkdown(json));
      onChange(md);
      onJsonChange?.(json);
      // Reset on next tick so external changes can be detected again
      queueMicrotask(() => {
        internalUpdateRef.current = false;
      });
      mentionUpdateFnRef.current?.(e);
    },
    onSelectionUpdate({ editor: e }) {
      mentionUpdateFnRef.current?.(e);
    },
    editorProps: {
      attributes: {
        ...(testId ? { "data-testid": testId } : {}),
        ...(id ? { id } : {}),
        "aria-label": ariaLabel,
      },
      handlePaste(_view, event) {
        const plainText = event.clipboardData?.getData('text/plain')?.trim() || '';
        const embed = parseRichEmbed(plainText);
        if (embed && context !== 'resource' && typeof window !== 'undefined' && window.confirm('检测到可嵌入内容，是否插入为结构化卡片？')) {
          event.preventDefault();
          richPasteInsertFnRef.current?.(embed);
          return true;
        }
        if (!imageUpload) return false;
        const files = event.clipboardData?.files;
        if (!files?.length) return false;
        const images = Array.from(files).filter(isUploadableImage);
        if (!images.length) return false;
        event.preventDefault();
        imageUploadFnRef.current?.(images);
        return true;
      },
      handleDrop(_view, event) {
        if (!imageUpload) return false;
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const images = Array.from(files).filter(isUploadableImage);
        if (!images.length) return false;
        event.preventDefault();
        imageUploadFnRef.current?.(images);
        return true;
      },
      handleKeyDown(_view, event) {
        return mentionKeydownFnRef.current?.(event) ?? false;
      },
    },
  });
  richPasteInsertFnRef.current = (node) => { editor?.chain().focus().insertContent(node).run(); };

  /* Sync external value changes (draft restore, edit-form initial load) */
  useEffect(() => {
    if (!editor || internalUpdateRef.current) return;
    const normalizedValue = normalizeEditorContent(value);
    if (value !== normalizedValue) {
      onChange(normalizedValue);
      lastExternalValueRef.current = normalizedValue;
    } else if (value !== lastExternalValueRef.current) {
      lastExternalValueRef.current = value;
      const currentMd = projectRichContentToMarkdown(editor.getJSON());
      if (!jsonValue && value !== currentMd) editor.commands.setContent(normalizedValue);
    }
    if (jsonValue) {
      const serialized = JSON.stringify(jsonValue);
      const current = JSON.stringify(editor.getJSON());
      if (serialized !== current) {
        editor.commands.setContent(jsonValue);
      }
    }
  }, [value, jsonValue, editor, onChange]);

  /* ── Image upload ────────────────────────────────────── */

  const handleImageUploads = useCallback(
    async (files: File[]) => {
      if (!editor) return;
      const uploadableFiles = files.filter(isUploadableImage);
      if (!uploadableFiles.length) {
        showError("请选择 PNG、JPG、GIF 或 WebP 图片（单张不超过 2MB）");
        return;
      }

      imageUploadQueueRef.current.push(...uploadableFiles);
      if (imageUploadProcessingRef.current) return;

      imageUploadProcessingRef.current = true;
      setUploading(true);
      let processed = 0;
      try {
        while (imageUploadQueueRef.current.length) {
          const file = imageUploadQueueRef.current.shift();
          if (!file) continue;
          const total = processed + imageUploadQueueRef.current.length + 1;
          setUploadProgress({ current: processed + 1, total, filename: file.name });
          try {
            const result = await uploadImage(file);
            editor
              .chain()
              .focus()
              .setImage({ src: result.url, alt: result.alt })
              .run();
          } catch (err) {
            const message = err instanceof Error ? err.message : "图片上传失败";
            setFailedUploads((previous) => [...previous, { file, message }]);
            showError(`${file.name}：${message}`);
          }
          processed += 1;
        }
      } finally {
        imageUploadProcessingRef.current = false;
        setUploading(false);
        setUploadProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [editor, showError],
  );

  // Keep the ref in sync so editorProps paste/drop handlers always call the latest version
  imageUploadFnRef.current = handleImageUploads;

  const retryFailedImageUploads = useCallback(() => {
    const files = failedUploads.map(({ file }) => file);
    setFailedUploads([]);
    if (files.length) void handleImageUploads(files);
  }, [failedUploads, handleImageUploads]);

  const triggerImagePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const triggerAttachmentPicker = useCallback(() => attachmentInputRef.current?.click(), []);
  const handleAttachmentFiles = useCallback(async (files: File[]) => {
    if (!editor || !files.length) return;
    if (files.length > 5) {
      showError('每次最多选择 5 个附件');
      return;
    }
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    setUploading(true);
    try {
      const result = await attachmentApi.createDrafts(form);
      editor.chain().focus().insertContent(result.drafts.map((draft) => ({
        type: 'attachment',
        attrs: { draftToken: draft.token },
      }))).run();
    } catch (error) {
      showError(error instanceof Error ? error.message : '附件上传失败，草稿仍保留在本地');
    } finally {
      setUploading(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    }
  }, [editor, showError]);

  const insertVideo = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('粘贴支持的视频链接（Bilibili、抖音或 HTTPS MP4/WebM）');
    const embed = parseRichEmbed(url?.trim() || '');
    if (!embed || embed.type !== 'video') {
      showError('此链接不是当前站点支持的视频来源');
      return;
    }
    editor.chain().focus().insertContent(embed).run();
  }, [editor, showError]);

  const insertQuote = useCallback(() => {
    if (!editor) return;
    const value = window.prompt('输入要引用的帖子 ID');
    const postId = Number(value);
    if (!Number.isSafeInteger(postId) || postId < 1) return;
    editor.chain().focus().insertContent({ type: 'postQuote', attrs: { postId } }).run();
  }, [editor]);

  /* ── @ user suggestions ─────────────────────────────── */

  const updateMentionSuggestions = useCallback((activeEditor: Editor) => {
    const { from, empty } = activeEditor.state.selection;
    if (!empty) {
      setMention(null);
      return;
    }

    // The server recognises `@(\\w+)`, so only offer names that will also produce
    // a notification after the Markdown is submitted.
    const textBeforeCursor = activeEditor.state.doc.textBetween(Math.max(0, from - 64), from, "\u0000", "\u0000");
    const match = /(?:^|\s)@([A-Za-z0-9_]{1,30})$/.exec(textBeforeCursor);
    if (!match) {
      setMention(null);
      return;
    }

    const coords = activeEditor.view.coordsAtPos(from);
    const nextMention: MentionSuggestion = {
      query: match[1],
      from: from - match[1].length - 1,
      // Use viewport coordinates so the menu is not clipped by the editor's
      // rounded/overflow-hidden container.
      top: coords.bottom + 4,
      left: Math.max(8, Math.min(coords.left, window.innerWidth - 268)),
    };
      setMention((previous) => (
      previous
      && previous.query === nextMention.query
      && previous.from === nextMention.from
      && previous.top === nextMention.top
      && previous.left === nextMention.left
        ? previous
        : nextMention
    ));
  }, []);

  mentionUpdateFnRef.current = updateMentionSuggestions;

  useEffect(() => {
    if (!mention?.query) {
      setMentionUsers([]);
      setMentionLoading(false);
      return;
    }
    const requestId = ++mentionRequestRef.current;
    setMentionLoading(true);
    const timer = window.setTimeout(() => {
      userApi.search(mention.query, 6)
        .then((users) => {
          if (mentionRequestRef.current === requestId) {
            setMentionUsers(users.filter((user) => Boolean(user.username)));
            setMentionLoading(false);
          }
        })
        .catch(() => {
          if (mentionRequestRef.current === requestId) {
            setMentionUsers([]);
            setMentionLoading(false);
          }
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mention?.query]);

  useEffect(() => {
    setActiveMentionIndex(0);
  }, [mention?.query]);

  const selectMentionUser = useCallback((user: MentionUser) => {
    if (!editor || !mention || !user.username) return;
    const to = editor.state.selection.from;
    if (to < mention.from) return;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: mention.from, to }, [
        { type: 'mention', attrs: { userId: user.id, username: user.username } },
        { type: 'text', text: ' ' },
      ])
      .run();
    setMention(null);
  }, [editor, mention]);

  const handleMentionKeydown = useCallback((event: KeyboardEvent): boolean => {
    // Let Android/iOS IME composition commit its candidate before handling mention keys.
    if (event.isComposing || event.keyCode === 229) return false;
    if (!mention) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      setMention(null);
      return true;
    }
    if (!mentionUsers.length) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveMentionIndex((index) => (index + 1) % mentionUsers.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveMentionIndex((index) => (index - 1 + mentionUsers.length) % mentionUsers.length);
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectMentionUser(mentionUsers[activeMentionIndex]);
      return true;
    }
    return false;
  }, [activeMentionIndex, mention, mentionUsers, selectMentionUser]);

  mentionKeydownFnRef.current = handleMentionKeydown;

  /* ── Link dialog ─────────────────────────────────────── */

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const prevUrl = editor.getAttributes("link").href || "";
    setLinkUrl(prevUrl);
    setLinkDialogOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    }
    setLinkDialogOpen(false);
  }, [editor, linkUrl]);

  /* ── Cleanup ─────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Render ──────────────────────────────────────────── */

  if (!editor) return null;

  return (
    <div className={`tiptap-wrapper ${className}`}>
      {/* Hidden file input for image picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) handleImageUploads(files);
          if (e.target) e.target.value = "";
        }}
      />
      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          if (files.length) void handleAttachmentFiles(files);
        }}
      />

      {/* ── Toolbar ─────────────────────────────────────── */}
      <EditorToolbar
        editor={editor}
        compact={compact}
        uploading={uploading}
        imageUpload={imageUpload}
        context={context}
        onTriggerImagePicker={triggerImagePicker}
        onTriggerAttachmentPicker={triggerAttachmentPicker}
        onInsertVideo={insertVideo}
        onInsertQuote={insertQuote}
        onOpenLinkDialog={openLinkDialog}
      />

      {/* ── Editor area ─────────────────────────────────── */}
      <EditorContent
        editor={editor}
        className="tiptap-content"
        style={{ minHeight }}
      />

      {/* ── Character count ─────────────────────────────── */}
        <div className="tiptap-status" aria-live="polite">
          {uploading && (
            <span className="tiptap-status-uploading">
              <Loader2 className="w-3 h-3 animate-spin" />
              {uploadProgress ? `正在上传 ${uploadProgress.current}/${uploadProgress.total}：${uploadProgress.filename}` : "图片上传中…"}
            </span>
          )}
          {!uploading && failedUploads.length > 0 && (
            <button type="button" onClick={retryFailedImageUploads} className="tiptap-upload-retry">
              重试失败的 {failedUploads.length} 张图片
            </button>
          )}
          <span className="tiptap-status-count">
            {editor.storage.characterCount?.characters() ?? 0} 字符
          </span>
        </div>

      {mention && (
        <div
          className="tiptap-mention-menu"
          role="listbox"
          aria-label={`提及用户：${mention.query}`}
          style={{ top: mention.top, left: mention.left }}
        >
          {mentionUsers.length > 0 ? mentionUsers.map((user, index) => (
            <button
              key={user.id}
              type="button"
              role="option"
              aria-selected={index === activeMentionIndex}
              className={`tiptap-mention-option ${index === activeMentionIndex ? "tiptap-mention-option-active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMentionUser(user)}
            >
              {user.avatar_url ? <img src={user.avatar_url} alt="" className="tiptap-mention-avatar" /> : <span className="tiptap-mention-avatar tiptap-mention-avatar-fallback" aria-hidden="true">@</span>}
              <span>@{user.username}</span>
            </button>
          )) : (
            <span className="tiptap-mention-empty">{mentionLoading ? "正在查找用户…" : "没有匹配的用户"}</span>
          )}
        </div>
      )}

      {/* ── Link dialog ─────────────────────────────────── */}
      {linkDialogOpen && (
        <LinkDialog
          url={linkUrl}
          onUrlChange={setLinkUrl}
          onApply={applyLink}
          onClose={() => setLinkDialogOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── Toolbar ─────────────────────────────────────────── */

const UNICODE_EMOJI_GROUPS: Record<string, string[]> = {
  常用: ['😀','😂','🥹','😊','😍','🤔','😎','😭','😅','😴','👍','👎','👏','🙏','🎉','❤️','🔥','✨','✅','❌'],
  表情: ['😃','😄','😁','😆','😋','😜','🤗','🤫','🤨','😐','🙄','😮','😱','😢','😡','🤯'],
  自然: ['🌱','🌿','🌸','🌻','🌈','☀️','🌙','⭐','⚡','🔥','❄️','🌊','🍀','🌍'],
  游戏: ['🎮','🕹️','👾','🤖','🚀','🛠️','⚙️','🧱','💎','🗺️','🏆','🎯'],
  食物: ['🍎','🍊','🍋','🍉','🍇','🍓','🍒','🍑','🥑','🍕','🍔','🍜','☕','🍵'],
};

function EmojiPicker({ editor }: { editor: Editor }) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem('mdtbbs:rich-emoji-recent') || '[]').filter((value: unknown) => typeof value === 'string')); } catch { setRecent([]); }
  }, []);
  const add = (emoji: string) => {
    editor.chain().focus().insertContent(emoji).run();
    const next = [emoji, ...recent.filter((item) => item !== emoji)].slice(0, 12);
    setRecent(next);
    try { localStorage.setItem('mdtbbs:rich-emoji-recent', JSON.stringify(next)); } catch { /* Browser storage may be disabled. */ }
    setQuery('');
  };
  const matches = Object.entries(UNICODE_EMOJI_GROUPS)
    .map(([category, values]) => [category, values.filter((emoji) => !query || emoji.includes(query))] as const)
    .filter(([, values]) => values.length);
  return <details className="tiptap-more tiptap-emoji-picker">
    <summary className="tiptap-btn tiptap-more-trigger" aria-label="Emoji 面板" title="Emoji"><Smile className="w-4 h-4" /><span>Emoji</span></summary>
    <div className="tiptap-more-menu tiptap-emoji-menu" role="group" aria-label="Emoji 面板">
      <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索 Emoji" placeholder="搜索 Emoji" className="tiptap-emoji-search" />
      {!query && recent.length > 0 && <section><strong>最近使用</strong><div className="tiptap-emoji-grid">{recent.map((emoji) => <button type="button" key={emoji} onClick={() => add(emoji)} aria-label={`插入 ${emoji}`}>{emoji}</button>)}</div></section>}
      {matches.map(([category, values]) => <section key={category}><strong>{category}</strong><div className="tiptap-emoji-grid">{values.map((emoji) => <button type="button" key={emoji} onClick={() => add(emoji)} aria-label={`插入 ${emoji}`}>{emoji}</button>)}</div></section>)}
      {query && !matches.length && <span className="tiptap-emoji-empty">没有匹配的 Emoji</span>}
    </div>
  </details>;
}

function CustomEmojiPicker({ editor }: { editor: Editor }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof customEmojiApi.listEnabled>>>([]);
  const [loaded, setLoaded] = useState(false);
  const load = () => {
    if (loaded) return;
    setLoaded(true);
    customEmojiApi.listEnabled().then(setItems).catch(() => setItems([]));
  };
  return <details className="tiptap-more tiptap-custom-emoji-picker" onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) load(); }}>
    <summary className="tiptap-btn tiptap-more-trigger" aria-label="论坛表情" title="论坛表情"><span>论坛表情</span></summary>
    <div className="tiptap-more-menu tiptap-emoji-menu" role="group" aria-label="论坛表情">
      {items.length ? items.map((emoji) => <button type="button" className="tiptap-custom-emoji-option" key={emoji.id} onClick={() => editor.chain().focus().insertContent({ type: 'customEmoji', attrs: { id: emoji.id, name: emoji.name, shortcode: emoji.shortcode } }).run()}>
        <img src={emoji.image_url} alt="" /> :{emoji.shortcode}:
      </button>) : <span className="tiptap-emoji-empty">{loaded ? '暂无启用的论坛表情' : '正在加载…'}</span>}
    </div>
  </details>;
}

interface ToolbarProps {
  editor: Editor;
  compact: boolean;
  uploading: boolean;
  imageUpload: boolean;
  context: 'post' | 'reply' | 'resource';
  onTriggerImagePicker: () => void;
  onTriggerAttachmentPicker: () => void;
  onOpenLinkDialog: () => void;
  onInsertVideo: () => void;
  onInsertQuote: () => void;
}

function EditorToolbar({
  editor,
  compact,
  uploading,
  imageUpload,
  context,
  onTriggerImagePicker,
  onTriggerAttachmentPicker,
  onOpenLinkDialog,
  onInsertVideo,
  onInsertQuote,
}: ToolbarProps) {
  const moreMenuRef = useRef<HTMLDetailsElement>(null);

  const closeMoreMenu = () => {
    if (moreMenuRef.current) moreMenuRef.current.open = false;
  };
  const menuButton = (content: React.ReactNode, title: string, onClick: () => void, active = false, testId?: string) => (
    <TBtn active={active} onClick={() => { onClick(); closeMoreMenu(); }} title={title} testId={testId}>
      {content}
    </TBtn>
  );

  return (
    <div className="tiptap-toolbar" role="toolbar" aria-label="编辑器工具栏">
      {!compact && <>
        <TBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="撤销 (Ctrl+Z)"><Undo2 className="w-4 h-4" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="重做 (Ctrl+Y)"><Redo2 className="w-4 h-4" /></TBtn>
        <Divider />
      </>}
      <TBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="粗体 (Ctrl+B)"><Bold className="w-4 h-4" /></TBtn>
      <TBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体 (Ctrl+I)"><Italic className="w-4 h-4" /></TBtn>
      <TBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="标题"><Heading2 className="w-4 h-4" /></TBtn>
      <TBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="无序列表"><List className="w-4 h-4" /></TBtn>
      <TBtn active={editor.isActive("link")} onClick={onOpenLinkDialog} title="链接 (Ctrl+K)"><Link2 className="w-4 h-4" /></TBtn>
      {imageUpload && <TBtn active={false} onClick={onTriggerImagePicker} disabled={uploading} title={uploading ? "上传中…" : "上传图片"}>
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="w-4 h-4" aria-hidden="true" />}
      </TBtn>}
      <EmojiPicker editor={editor} />
      <Divider />
      <details className="tiptap-more" ref={moreMenuRef}>
        <summary className="tiptap-btn tiptap-more-trigger" aria-label="更多编辑工具" title="更多编辑工具"><span aria-hidden="true">…</span><span>更多</span></summary>
        <div className="tiptap-more-menu" role="group" aria-label="更多编辑工具">
          {menuButton(<Type className="w-4 h-4" />, "正文", () => editor.chain().focus().setParagraph().run(), !editor.isActive("heading") && editor.isActive("paragraph"))}
          {!compact && <>
            {menuButton(<Heading1 className="w-4 h-4" />, "标题 1", () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }))}
            {menuButton(<Heading3 className="w-4 h-4" />, "标题 3", () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}
            {menuButton(<ListOrdered className="w-4 h-4" />, "有序列表", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
          </>}
          {menuButton(<Strikethrough className="w-4 h-4" />, "删除线", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
          {menuButton(<UnderlineIcon className="w-4 h-4" />, "下划线", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
          {menuButton(<Code className="w-4 h-4" />, "行内代码", () => editor.chain().focus().toggleCode().run(), editor.isActive("code"))}
          {menuButton(<Quote className="w-4 h-4" />, "引用", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
          {menuButton(<ListTodo className="w-4 h-4" />, "任务列表", () => editor.chain().focus().insertContent({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] }).run(), editor.isActive("taskList"), "rich-task-list")}
          {menuButton(<span>剧透</span>, "插入剧透折叠", () => editor.chain().focus().insertContent({ type: 'spoiler', attrs: { title: '剧透内容', open: false }, content: [{ type: 'paragraph' }] }).run(), editor.isActive("spoiler"), "rich-spoiler")}
          {menuButton(<span>x²</span>, "上标", () => editor.chain().focus().toggleMark('superscript').run(), editor.isActive("superscript"))}
          {menuButton(<span>x₂</span>, "下标", () => editor.chain().focus().toggleMark('subscript').run(), editor.isActive("subscript"))}
          {menuButton(<span>荧光</span>, "黄色高亮", () => editor.chain().focus().setMark('highlight', { color: 'yellow' }).run(), editor.isActive('highlight'))}
          {!compact && <label className="tiptap-select-label" title="文字颜色">颜色<input aria-label="文字颜色" type="color" defaultValue="#C62828" onChange={(event) => editor.chain().focus().setMark('textColor', { color: event.target.value.toUpperCase() }).run()} /></label>}
          {!compact && <label className="tiptap-select-label" title="字号">字号<select aria-label="字号" defaultValue="16px" onChange={(event) => editor.chain().focus().setMark('fontSize', { size: event.target.value }).run()}>{[12, 14, 16, 18, 20, 24, 28, 32].map((size) => <option key={size} value={`${size}px`}>{size}px</option>)}</select></label>}
          {!compact && <label className="tiptap-select-label" title="字体">字体<select aria-label="字体" defaultValue="default" onChange={(event) => editor.chain().focus().setMark('fontFamily', { family: event.target.value }).run()}>{[['default','默认'],['serif-cn','宋体'],['sans-cn','黑体'],['kai','楷体'],['source-serif-cn','思源宋体'],['source-sans-cn','思源黑体'],['monospace','等宽字体']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
          {menuButton(<Code2 className="w-4 h-4" />, "代码块", () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive("codeBlock"))}
          {context !== 'reply' && menuButton(<TableIcon className="w-4 h-4" />, "插入标准 GFM 表格", () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), editor.isActive("table"))}
          {context !== 'reply' && editor.isActive("table") && <>
            {menuButton(<span>行+</span>, "在下方增加一行", () => editor.chain().focus().addRowAfter().run())}
            {menuButton(<span>行−</span>, "删除当前行", () => editor.chain().focus().deleteRow().run())}
            {menuButton(<span>列+</span>, "在右侧增加一列", () => editor.chain().focus().addColumnAfter().run())}
            {menuButton(<span>列−</span>, "删除当前列", () => editor.chain().focus().deleteColumn().run())}
            {menuButton(<span>删表</span>, "删除表格", () => editor.chain().focus().deleteTable().run())}
          </>}
          {menuButton(<Minus className="w-4 h-4" />, "分割线", () => editor.chain().focus().setHorizontalRule().run())}
          <CustomEmojiPicker editor={editor} />
          {context !== 'resource' && <>
            {menuButton(<Paperclip className="w-4 h-4" />, "上传附件", onTriggerAttachmentPicker, false, 'rich-attachment')}
            {menuButton(<Film className="w-4 h-4" />, "插入视频", onInsertVideo, false, 'rich-video')}
            {menuButton(<span>引用帖</span>, "引用帖子", onInsertQuote, false, 'rich-post-quote')}
          </>}
        </div>
      </details>
    </div>
  );
}

/* ─── Toolbar button ──────────────────────────────────── */

function TBtn({
  children,
  active,
  onClick,
  disabled,
  title,
  testId,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`tiptap-btn ${active ? "tiptap-btn-active" : ""}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="tiptap-divider" />;
}

/* ─── Link dialog ─────────────────────────────────────── */

function LinkDialog({
  url,
  onUrlChange,
  onApply,
  onClose,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onApply();
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onApply, onClose]);

  return (
    <div className="tiptap-link-dialog" role="presentation">
      <div
        className="tiptap-link-dialog-inner"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tiptap-link-dialog-title"
      >
        <h2 id="tiptap-link-dialog-title" className="sr-only">插入或编辑链接</h2>
        <label htmlFor="tiptap-link-url" className="sr-only">链接地址</label>
        <input
          ref={inputRef}
          id="tiptap-link-url"
          type="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="输入链接地址 https://…"
          className="tiptap-link-input"
        />
        <button type="button" onClick={onApply} className="tiptap-link-apply">
          确定
        </button>
        <button type="button" onClick={onClose} className="tiptap-link-cancel">
          取消
        </button>
      </div>
    </div>
  );
}
