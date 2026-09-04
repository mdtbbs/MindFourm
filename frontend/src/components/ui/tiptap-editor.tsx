"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import ImageExt from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import LinkExt from "@tiptap/extension-link";
import CharacterCount from "@tiptap/extension-character-count";
import { Table as TableExtension } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import type { Editor } from "@tiptap/react";
import { uploadImage, isUploadableImage } from "@/lib/tiptap/upload-image";
import { userApi } from "@/lib/api/client";
import { useToastStore } from "@/store/toast-store";
import { normalizeEditorContent } from "@/lib/editor-content";
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
  CodeXml,
  Eye,
  Loader2,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────── */

interface TiptapEditorProps {
  /** Markdown string — the editor reads this on mount and when it changes externally. */
  value: string;
  /** Called with the current Markdown string whenever content changes. */
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** CSS min-height for the editor area. */
  minHeight?: string;
  /** Compact toolbar for reply editors (fewer buttons). */
  compact?: boolean;
  /** Enable paste/drop/button image upload. */
  imageUpload?: boolean;
  /** Applied to the editable surface and source textarea for E2E/tests. */
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
  placeholder = "使用 Markdown 格式编写内容…",
  minHeight = "200px",
  compact = false,
  imageUpload = false,
  testId,
  id,
  ariaLabel = "富文本编辑器",
  className = "",
}: TiptapEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [failedUploads, setFailedUploads] = useState<FailedImageUpload[]>([]);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState(value);
  const [mention, setMention] = useState<MentionSuggestion | null>(null);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const mentionRequestRef = useRef(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // replaced by CodeBlockLowlight
        // StarterKit v3 includes link — disable it because we add a configured version below.
        link: false,
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      // Persist uploaded URLs only. Base64 image data can make a post enormous and
      // is not accepted by the server-side Markdown sanitizer in any case.
      ImageExt.configure({ inline: true, allowBase64: false }),
      Placeholder.configure({ placeholder }),
      LinkExt.configure({
        openOnClick: false,
        HTMLAttributes: { class: "editor-link" },
      }),
      CharacterCount,
      // GFM preserves table text, headers and rows, but not layout geometry.
      // Disabling resize avoids presenting column-width editing that cannot survive
      // a Markdown save and subsequent visual-editor reload.
      TableExtension.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight: createLowlight(common) }),
    ],
    content: normalizeEditorContent(value),
    onUpdate({ editor: e }) {
      internalUpdateRef.current = true;
      const md = normalizeEditorContent(
        (e.storage as any).markdown?.getMarkdown() ?? "",
      );
      onChange(md);
      setSourceValue(md);
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

  /* Sync external value changes (draft restore, edit-form initial load) */
  useEffect(() => {
    if (!editor || internalUpdateRef.current) return;
    const normalizedValue = normalizeEditorContent(value);
    if (value !== normalizedValue) {
      onChange(normalizedValue);
      setSourceValue(normalizedValue);
      lastExternalValueRef.current = normalizedValue;
      return;
    }
    if (value === lastExternalValueRef.current) return;
    lastExternalValueRef.current = value;
    const currentMd = (editor.storage as any).markdown?.getMarkdown() ?? "";
    if (value !== currentMd) {
      editor.commands.setContent(normalizedValue);
      setSourceValue(normalizedValue);
    }
  }, [value, editor, onChange]);

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
      .insertContentAt({ from: mention.from, to }, `@${user.username} `)
      .run();
    setMention(null);
  }, [editor, mention]);

  const handleMentionKeydown = useCallback((event: KeyboardEvent): boolean => {
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

  /* ── Source mode toggle ──────────────────────────────── */

  const toggleSourceMode = useCallback(() => {
    if (!editor) return;
    if (sourceMode) {
      // Switching back to WYSIWYG: push source text into the editor
      editor.commands.setContent(normalizeEditorContent(sourceValue));
      const md = normalizeEditorContent(
        (editor.storage as any).markdown?.getMarkdown() ?? "",
      );
      onChange(md);
      lastExternalValueRef.current = md;
    } else {
      // Switching to source: grab current markdown
      const md = (editor.storage as any).markdown?.getMarkdown() ?? "";
      setSourceValue(md);
    }
    setSourceMode((v) => !v);
  }, [editor, sourceMode, sourceValue, onChange]);

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

      {/* ── Toolbar ─────────────────────────────────────── */}
      <EditorToolbar
        editor={editor}
        compact={compact}
        uploading={uploading}
        imageUpload={imageUpload}
        sourceMode={sourceMode}
        onTriggerImagePicker={triggerImagePicker}
        onOpenLinkDialog={openLinkDialog}
        onToggleSourceMode={toggleSourceMode}
      />

      {/* ── Editor area ─────────────────────────────────── */}
      {sourceMode ? (
        <textarea
          value={sourceValue}
          onChange={(e) => {
            setSourceValue(e.target.value);
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          id={id}
          data-testid={testId}
          aria-label={ariaLabel}
          className="tiptap-source"
          style={{ minHeight }}
        />
      ) : (
        <EditorContent
          editor={editor}
          className="tiptap-content"
          style={{ minHeight }}
        />
      )}

      {/* ── Character count ─────────────────────────────── */}
      {!sourceMode && (
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
          <span
            className="tiptap-status-count"
            title="保存为标准 Markdown；表格仅支持标准 GFM 表格，不保存下划线、对齐或列宽样式。"
          >
            Markdown 兼容模式
          </span>
        </div>
      )}

      {mention && !sourceMode && (
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

interface ToolbarProps {
  editor: Editor;
  compact: boolean;
  uploading: boolean;
  imageUpload: boolean;
  sourceMode: boolean;
  onTriggerImagePicker: () => void;
  onOpenLinkDialog: () => void;
  onToggleSourceMode: () => void;
}

function EditorToolbar({
  editor,
  compact,
  uploading,
  imageUpload,
  sourceMode,
  onTriggerImagePicker,
  onOpenLinkDialog,
  onToggleSourceMode,
}: ToolbarProps) {
  if (sourceMode) {
    return (
      <div className="tiptap-toolbar" role="toolbar" aria-label="编辑器工具栏">
        <TBtn
          active={false}
          onClick={onToggleSourceMode}
          title="返回可视化编辑"
        >
          <Eye className="w-4 h-4" /> 预览
        </TBtn>
      </div>
    );
  }

  const isLinkActive = editor.isActive("link");

  return (
    <div className="tiptap-toolbar" role="toolbar" aria-label="编辑器工具栏">
      {/* Undo / Redo */}
      {!compact && (
        <>
          <TBtn
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </TBtn>
          <TBtn
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="重做 (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </TBtn>
          <Divider />
        </>
      )}

      {/* Text formatting */}
      <TBtn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="粗体 (Ctrl+B)"
      >
        <Bold className="w-4 h-4" />
      </TBtn>
      <TBtn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="斜体 (Ctrl+I)"
      >
        <Italic className="w-4 h-4" />
      </TBtn>
      <TBtn
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="删除线"
      >
        <Strikethrough className="w-4 h-4" />
      </TBtn>

      <Divider />

      {/* Headings */}
      {compact ? (
        <TBtn
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          title="标题"
        >
          <Heading2 className="w-4 h-4" />
        </TBtn>
      ) : (
        <>
          <TBtn
            active={editor.isActive("heading", { level: 1 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            title="标题 1"
          >
            <Heading1 className="w-4 h-4" />
          </TBtn>
          <TBtn
            active={editor.isActive("heading", { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            title="标题 2"
          >
            <Heading2 className="w-4 h-4" />
          </TBtn>
          <TBtn
            active={editor.isActive("heading", { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            title="标题 3"
          >
            <Heading3 className="w-4 h-4" />
          </TBtn>
          <TBtn
            active={!editor.isActive("heading") && editor.isActive("paragraph")}
            onClick={() => editor.chain().focus().setParagraph().run()}
            title="正文"
          >
            <Type className="w-4 h-4" />
          </TBtn>
        </>
      )}

      <Divider />

      {/* Block elements */}
      <TBtn
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="引用"
      >
        <Quote className="w-4 h-4" />
      </TBtn>
      <TBtn
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="行内代码"
      >
        <Code className="w-4 h-4" />
      </TBtn>
      {!compact && (
        <TBtn
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="代码块"
        >
          <Code2 className="w-4 h-4" />
        </TBtn>
      )}

      <Divider />

      {/* Lists */}
      <TBtn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="无序列表"
      >
        <List className="w-4 h-4" />
      </TBtn>
      <TBtn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="有序列表"
      >
        <ListOrdered className="w-4 h-4" />
      </TBtn>

      <Divider />

      {/* Insert */}
      <TBtn
        active={isLinkActive}
        onClick={onOpenLinkDialog}
        title="链接 (Ctrl+K)"
      >
        <Link2 className="w-4 h-4" />
      </TBtn>
      {imageUpload && (
        <TBtn
          active={false}
          onClick={onTriggerImagePicker}
          disabled={uploading}
          title={uploading ? "上传中…" : "上传图片"}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ImageIcon className="w-4 h-4" aria-hidden="true" />
          )}
        </TBtn>
      )}
      {!compact && (
        <TBtn
          active={editor.isActive("table")}
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          title="插入标准 GFM 表格"
        >
          <TableIcon className="w-4 h-4" />
        </TBtn>
      )}

      {!compact && <>
        <Divider />
        <TBtn
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="分割线"
        >
          <Minus className="w-4 h-4" />
        </TBtn>
      </>}

      {/* Spacer + source toggle */}
      <div className="flex-1" />
      <TBtn
        active={sourceMode}
        onClick={onToggleSourceMode}
        title="Markdown 源码"
      >
        <CodeXml className="w-4 h-4" />
      </TBtn>
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
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
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
