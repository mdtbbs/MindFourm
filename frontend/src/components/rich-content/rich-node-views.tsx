'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { RichVideoCard } from './rich-video-card';
import { RichAttachmentCard } from './rich-attachment-card';
import { RichQuoteCard } from './rich-quote-card';

/** NodeViews change only presentation; renderHTML remains the Schema v2 serializer. */
export function RichCardNodeView({ node }: NodeViewProps) {
  const attrs = node.attrs;
  return <NodeViewWrapper contentEditable={false}>
    {node.type.name === 'video' ? <RichVideoCard attrs={attrs} editing />
      : node.type.name === 'attachment' ? <RichAttachmentCard id={attrs.attachmentId || undefined} draftToken={attrs.draftToken || undefined} editing />
      : <RichQuoteCard postId={attrs.postId} replyId={node.type.name === 'replyQuote' ? attrs.replyId : undefined} editing />}
  </NodeViewWrapper>;
}
