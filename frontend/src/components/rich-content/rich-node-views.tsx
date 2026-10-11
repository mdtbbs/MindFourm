'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { RichVideoCard } from './rich-video-card';
import { RichAttachmentCard } from './rich-attachment-card';
import { RichQuoteCard } from './rich-quote-card';
import { RichHtmlBlock } from './rich-html-block';

/**
 * The HTML block shows its rendered result in the editor.
 *
 * That is the only honest preview for markup the editor does not model: what the
 * author sees while editing is what a reader gets. It goes through the same
 * `RichHtmlBlock` the reader uses, so an impossible-to-sanitize fragment shows up
 * as missing *here* rather than only after publishing.
 */
export function RichHtmlBlockNodeView({ node }: NodeViewProps) {
  const html = typeof node.attrs.html === 'string' ? node.attrs.html : '';
  return <NodeViewWrapper contentEditable={false}>
    {html
      ? <RichHtmlBlock html={html} />
      : <div className="rich-html-block rich-html-block--empty" data-testid="rich-html-block-empty">HTML 区块（空）</div>}
  </NodeViewWrapper>;
}

/** NodeViews change only presentation; renderHTML remains the Schema v2 serializer. */
export function RichCardNodeView({ node }: NodeViewProps) {
  const attrs = node.attrs;
  return <NodeViewWrapper contentEditable={false}>
    {node.type.name === 'video' ? <RichVideoCard attrs={attrs} editing />
      : node.type.name === 'attachment' ? <RichAttachmentCard id={attrs.attachmentId || undefined} draftToken={attrs.draftToken || undefined} editing />
      : <RichQuoteCard postId={attrs.postId} replyId={node.type.name === 'replyQuote' ? attrs.replyId : undefined} editing />}
  </NodeViewWrapper>;
}
