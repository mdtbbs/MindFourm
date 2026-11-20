'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { RichVideoCard } from './rich-video-card';
import { RichAttachmentCard } from './rich-attachment-card';
import { RichQuoteCard } from './rich-quote-card';
import { RichHtmlBlock } from './rich-html-block';
import { RichBattleReportCard } from './rich-battle-report-card';
import { ResourceEmbedCard } from './resource-embed-card';
import { isValidResourceEmbedAttrs } from '@/lib/api/v1/resource-embeds';
import { useI18n } from '@/i18n/provider';

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

/**
 * Invalid embed data never becomes a card.
 *
 * The command refuses to create such a node, but older/hand-edited documents can
 * still carry one; showing an explicit placeholder is safer than guessing which
 * resource the author meant.
 */
export function ResourceEmbedNodeView({ node }: NodeViewProps) {
  const { t } = useI18n();
  const attrs = node.attrs;
  if (!isValidResourceEmbedAttrs(attrs)) {
    return <NodeViewWrapper contentEditable={false}>
      <div className="my-4 border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-sm" data-testid="resource-embed-invalid" role="note">
        <strong className="block">{t('resourceEmbed.invalid.title')}</strong>
        <span className="mt-1 block text-[var(--text-muted)]">{t('resourceEmbed.invalid.description')}</span>
      </div>
    </NodeViewWrapper>;
  }
  return <NodeViewWrapper contentEditable={false}>
    <ResourceEmbedCard
      resourcePublicId={attrs.resourcePublicId}
      versionPublicId={attrs.versionPublicId ?? null}
      displayMode="card"
    />
  </NodeViewWrapper>;
}

/** NodeViews change only presentation; renderHTML remains the Schema v2 serializer. */
export function RichCardNodeView({ node }: NodeViewProps) {
  const attrs = node.attrs;
  return <NodeViewWrapper contentEditable={false}>
    {node.type.name === 'battleReport'
      ? <RichBattleReportCard
        publicId={typeof attrs.timelapsePublicId === 'string' ? attrs.timelapsePublicId : null}
        mapName={typeof attrs.mapName === 'string' ? attrs.mapName : ''}
        maxWave={Number.isFinite(Number(attrs.maxWave)) ? Number(attrs.maxWave) : 0}
        editing
      />
      : node.type.name === 'video' ? <RichVideoCard attrs={attrs} editing />
      : node.type.name === 'attachment' ? <RichAttachmentCard id={attrs.attachmentId || undefined} draftToken={attrs.draftToken || undefined} editing />
      : <RichQuoteCard postId={attrs.postId} replyId={node.type.name === 'replyQuote' ? attrs.replyId : undefined} editing />}
  </NodeViewWrapper>;
}
