'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import ImageExt from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import LinkExt from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import CharacterCount from '@tiptap/extension-character-count';
import { Table as TableExtension } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import type { Editor } from '@tiptap/react';
import { uploadImage, isUploadableImage } from '@/lib/tiptap/upload-image';
import { useToastStore } from '@/store/toast-store';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, Type,
  Quote, Code, Code2,
  List, ListOrdered,
  Link2, Image, Table as TableIcon, Minus,
  AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2,
  CodeXml, Eye,
  Loader2,
} from 'lucide-react';

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
  className?: string;
}

/* ─── Main component ────────────────────────────────────── */

export default function TiptapEditor({
  value,
  onChange,
  placeholder = '使用 Markdown 格式编写内容…',
  minHeight = '200px',
  compact = false,
  imageUpload = false,
  testId,
  className = '',
}: TiptapEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState(value);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showError = useToastStore((s) => s.showError);
  // Track whether a value change comes from the editor itself (to avoid re-setting content)
  const internalUpdateRef = useRef(false);
  const lastExternalValueRef = useRef(value);
  // Ref for the image upload function — editorProps captures this at creation time,
  // but the actual handler is defined later (depends on `editor`). The ref bridges
  // the gap so paste/drop always calls the latest version.
  const imageUploadFnRef = useRef<(files: File[]) => Promise<void>>();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // replaced by CodeBlockLowlight
        // StarterKit v3 includes link and underline — disable to avoid duplicates
        // since we add our own configured versions below.
        link: false,
        underline: false,
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      ImageExt.configure({ inline: true, allowBase64: true }),
      Placeholder.configure({ placeholder }),
      Underline,
      LinkExt.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      CharacterCount,
      TableExtension.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight: createLowlight(common) }),
    ],
    content: value || '<p></p>',
    onUpdate({ editor: e }) {
      internalUpdateRef.current = true;
      const md = (e.storage as any).markdown?.getMarkdown() ?? '';
      onChange(md);
      setSourceValue(md);
      // Reset on next tick so external changes can be detected again
      queueMicrotask(() => { internalUpdateRef.current = false; });
    },
    editorProps: {
      attributes: testId ? { 'data-testid': testId } : {},
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
    },
  });

  /* Sync external value changes (draft restore, edit-form initial load) */
  useEffect(() => {
    if (!editor || internalUpdateRef.current) return;
    if (value === lastExternalValueRef.current) return;
    lastExternalValueRef.current = value;
    const currentMd = (editor.storage as any).markdown?.getMarkdown() ?? '';
    if (value !== currentMd) {
      editor.commands.setContent(value || '<p></p>');
      setSourceValue(value);
    }
  }, [value, editor]);

  /* ── Image upload ────────────────────────────────────── */

  const handleImageUploads = useCallback(async (files: File[]) => {
    if (!editor) return;
    setUploading(true);
    try {
      for (const file of files) {
        try {
          const result = await uploadImage(file);
          editor.chain().focus().setImage({ src: result.url, alt: result.alt }).run();
        } catch (err) {
          showError(err instanceof Error ? err.message : '图片上传失败');
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [editor, showError]);

  // Keep the ref in sync so editorProps paste/drop handlers always call the latest version
  imageUploadFnRef.current = handleImageUploads;

  const triggerImagePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /* ── Source mode toggle ──────────────────────────────── */

  const toggleSourceMode = useCallback(() => {
    if (!editor) return;
    if (sourceMode) {
      // Switching back to WYSIWYG: push source text into the editor
      editor.commands.setContent(sourceValue || '<p></p>');
      const md = (editor.storage as any).markdown?.getMarkdown() ?? '';
      onChange(md);
      lastExternalValueRef.current = md;
    } else {
      // Switching to source: grab current markdown
      const md = (editor.storage as any).markdown?.getMarkdown() ?? '';
      setSourceValue(md);
    }
    setSourceMode((v) => !v);
  }, [editor, sourceMode, sourceValue, onChange]);

  /* ── Link dialog ─────────────────────────────────────── */

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const prevUrl = editor.getAttributes('link').href || '';
    setLinkUrl(prevUrl);
    setLinkDialogOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setLinkDialogOpen(false);
  }, [editor, linkUrl]);

  /* ── Cleanup ─────────────────────────────────────────── */

  useEffect(() => {
    return () => { editor?.destroy(); };
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
          if (e.target) e.target.value = '';
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
          data-testid={testId}
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
        <div className="tiptap-status">
          {uploading && (
            <span className="tiptap-status-uploading">
              <Loader2 className="w-3 h-3 animate-spin" /> 图片上传中…
            </span>
          )}
          <span className="tiptap-status-count">
            {editor.storage.characterCount?.characters() ?? 0} 字符
          </span>
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
  editor, compact, uploading, imageUpload, sourceMode,
  onTriggerImagePicker, onOpenLinkDialog, onToggleSourceMode,
}: ToolbarProps) {
  if (sourceMode) {
    return (
      <div className="tiptap-toolbar">
        <TBtn active={false} onClick={onToggleSourceMode} title="返回可视化编辑">
          <Eye className="w-4 h-4" /> 预览
        </TBtn>
      </div>
    );
  }

  const isLinkActive = editor.isActive('link');

  return (
    <div className="tiptap-toolbar">
      {/* Undo / Redo */}
      {!compact && (
        <>
          <TBtn onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()} title="撤销 (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()} title="重做 (Ctrl+Y)">
            <Redo2 className="w-4 h-4" />
          </TBtn>
          <Divider />
        </>
      )}

      {/* Text formatting */}
      <TBtn active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()} title="粗体 (Ctrl+B)">
        <Bold className="w-4 h-4" />
      </TBtn>
      <TBtn active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体 (Ctrl+I)">
        <Italic className="w-4 h-4" />
      </TBtn>
      {!compact && (
        <TBtn active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()} title="下划线 (Ctrl+U)">
          <UnderlineIcon className="w-4 h-4" />
        </TBtn>
      )}
      <TBtn active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()} title="删除线">
        <Strikethrough className="w-4 h-4" />
      </TBtn>

      <Divider />

      {/* Headings */}
      {compact ? (
        <TBtn active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="标题">
          <Heading2 className="w-4 h-4" />
        </TBtn>
      ) : (
        <>
          <TBtn active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="标题 1">
            <Heading1 className="w-4 h-4" />
          </TBtn>
          <TBtn active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="标题 2">
            <Heading2 className="w-4 h-4" />
          </TBtn>
          <TBtn active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="标题 3">
            <Heading3 className="w-4 h-4" />
          </TBtn>
          <TBtn active={!editor.isActive('heading') && editor.isActive('paragraph')}
            onClick={() => editor.chain().focus().setParagraph().run()} title="正文">
            <Type className="w-4 h-4" />
          </TBtn>
        </>
      )}

      <Divider />

      {/* Block elements */}
      <TBtn active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()} title="引用">
        <Quote className="w-4 h-4" />
      </TBtn>
      <TBtn active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()} title="行内代码">
        <Code className="w-4 h-4" />
      </TBtn>
      {!compact && (
        <TBtn active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="代码块">
          <Code2 className="w-4 h-4" />
        </TBtn>
      )}

      <Divider />

      {/* Lists */}
      <TBtn active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()} title="无序列表">
        <List className="w-4 h-4" />
      </TBtn>
      <TBtn active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()} title="有序列表">
        <ListOrdered className="w-4 h-4" />
      </TBtn>

      <Divider />

      {/* Insert */}
      <TBtn active={isLinkActive}
        onClick={onOpenLinkDialog} title="链接 (Ctrl+K)">
        <Link2 className="w-4 h-4" />
      </TBtn>
      {imageUpload && (
        <TBtn active={false}
          onClick={onTriggerImagePicker}
          disabled={uploading}
          title={uploading ? '上传中…' : '上传图片'}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
        </TBtn>
      )}
      {!compact && (
        <TBtn active={editor.isActive('table')}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="表格">
          <TableIcon className="w-4 h-4" />
        </TBtn>
      )}

      {!compact && (
        <>
          <Divider />
          {/* Text align */}
          <TBtn active={editor.isActive({ textAlign: 'left' })}
            onClick={() => editor.chain().focus().setTextAlign('left').run()} title="左对齐">
            <AlignLeft className="w-4 h-4" />
          </TBtn>
          <TBtn active={editor.isActive({ textAlign: 'center' })}
            onClick={() => editor.chain().focus().setTextAlign('center').run()} title="居中">
            <AlignCenter className="w-4 h-4" />
          </TBtn>
          <TBtn active={editor.isActive({ textAlign: 'right' })}
            onClick={() => editor.chain().focus().setTextAlign('right').run()} title="右对齐">
            <AlignRight className="w-4 h-4" />
          </TBtn>
          <Divider />
          <TBtn active={false}
            onClick={() => editor.chain().focus().setHorizontalRule().run()} title="分割线">
            <Minus className="w-4 h-4" />
          </TBtn>
        </>
      )}

      {/* Spacer + source toggle */}
      <div className="flex-1" />
      <TBtn active={sourceMode} onClick={onToggleSourceMode} title="Markdown 源码">
        <CodeXml className="w-4 h-4" />
      </TBtn>
    </div>
  );
}

/* ─── Toolbar button ──────────────────────────────────── */

function TBtn({ children, active, onClick, disabled, title }: {
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
      onClick={onClick}
      disabled={disabled}
      className={`tiptap-btn ${active ? 'tiptap-btn-active' : ''}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="tiptap-divider" />;
}

/* ─── Link dialog ─────────────────────────────────────── */

function LinkDialog({ url, onUrlChange, onApply, onClose }: {
  url: string;
  onUrlChange: (v: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onApply(); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onApply, onClose]);

  return (
    <div className="tiptap-link-dialog">
      <div className="tiptap-link-dialog-inner">
        <input
          ref={inputRef}
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
