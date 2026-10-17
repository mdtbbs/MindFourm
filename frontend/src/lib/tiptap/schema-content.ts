/**
 * Content expressions the frontend editor and the API validator must agree on.
 *
 * Tiptap's stock nodes accept a whole `block+` (or `paragraph block*`) as
 * children, which is wider than what `normalizeTiptapDocument` allows. That gap
 * is reachable from the toolbar itself: 剧透 inside a 列表项 or 表格单元格, or an
 * 视频/附件/引用帖 inside a 引用块, all produce documents the API rejects with
 * `INVALID_CONTENT_JSON`. The user only finds out when the publish fails, or the
 * node is silently dropped on the next edit.
 *
 * These lists are the frontend half of that contract; `childAllowed()` in
 * `src/common/utils/tiptap-content.util.ts` is the backend half.
 * `tiptap-content.contract.spec.ts` loads both and fails when they drift.
 */

/** Blocks allowed inside `listItem`, `taskItem`, `tableCell`, `tableHeader` and `spoiler`. */
export const CONTAINER_BLOCKS = [
  'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList',
  'codeBlock', 'horizontalRule', 'table', 'video', 'attachment', 'postQuote', 'replyQuote',
] as const;

/** `doc` and `blockquote` accept everything above plus a spoiler. */
export const DOC_BLOCKS = [...CONTAINER_BLOCKS, 'spoiler'] as const;

/** A blockquote carries no video / attachment / quote cards — the API rejects them there. */
export const BLOCKQUOTE_BLOCKS = [
  'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList',
  'codeBlock', 'horizontalRule', 'table', 'spoiler',
] as const;

export const blockContent = (blocks: readonly string[]) => '(' + blocks.join(' | ') + ')';
export const positiveBlockContent = (blocks: readonly string[]) => blockContent(blocks) + '+';
