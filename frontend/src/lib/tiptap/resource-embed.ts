import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { ResourceEmbedNodeView } from '@/components/rich-content/rich-node-views';
import {
  RESOURCE_EMBED_LIMIT,
  isResourceEmbedUuid,
  isValidResourceEmbedAttrs,
  type ResourceEmbedAttrs,
} from '@/lib/api/v1/resource-embeds';

export const RESOURCE_EMBED_NODE_NAME = 'resourceEmbed';
export const RESOURCE_EMBED_FALLBACK_TEXT = '资源卡片';

export type InsertResourceEmbedAttrs = {
  resourcePublicId: string;
  versionPublicId?: string | null;
  displayMode?: 'card';
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resourceEmbed: {
      /**
       * Insert one resource card at the cursor. Returns `false` for invalid
       * ids/attributes or when the document already holds the maximum of ten.
       */
      insertResourceEmbed: (attrs: InsertResourceEmbedAttrs) => ReturnType;
    };
  }
}

export function countResourceEmbedNodes(doc: ProseMirrorNode): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === RESOURCE_EMBED_NODE_NAME) count += 1;
  });
  return count;
}

function normalizeCommandAttrs(attrs: InsertResourceEmbedAttrs): ResourceEmbedAttrs | null {
  const candidate = {
    resourcePublicId: attrs?.resourcePublicId,
    versionPublicId: attrs?.versionPublicId ?? null,
    displayMode: attrs?.displayMode ?? 'card',
  };
  return isValidResourceEmbedAttrs(candidate) ? candidate : null;
}

/**
 * A block-level reference to a published resource.
 *
 * The node stores only public identifiers: the card content is hydrated by
 * `ResourceEmbedCard`, never copied into the document. That keeps a post small,
 * lets a renamed resource keep working, and means an unpublished resource row
 * cannot leak its title through stored JSON.
 *
 * The serialized HTML is the same fallback the API projection emits (an
 * `<aside>` with a link), so a renderer that does not know this node still
 * produces a usable link.
 */
export const ResourceEmbed = Node.create({
  name: RESOURCE_EMBED_NODE_NAME,
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      resourcePublicId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-resource-embed') || null,
        renderHTML: (attributes) => ({
          'data-resource-embed': isResourceEmbedUuid(attributes.resourcePublicId) ? attributes.resourcePublicId : '',
        }),
      },
      versionPublicId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-resource-version') || null,
        renderHTML: (attributes) => isResourceEmbedUuid(attributes.versionPublicId)
          ? { 'data-resource-version': attributes.versionPublicId }
          : {},
      },
      displayMode: {
        default: 'card',
        // Only `card` exists; any other stored value is normalized rather than
        // asking the card renderer to guess a layout.
        parseHTML: () => 'card',
        renderHTML: () => ({ 'data-display-mode': 'card' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-resource-embed]' }];
  },

  renderHTML({ node }) {
    const resourcePublicId = isResourceEmbedUuid(node.attrs.resourcePublicId) ? node.attrs.resourcePublicId : null;
    const versionPublicId = isResourceEmbedUuid(node.attrs.versionPublicId) ? node.attrs.versionPublicId : null;
    return ['aside', mergeAttributes({
      'data-resource-embed': resourcePublicId ?? '',
      ...(versionPublicId ? { 'data-resource-version': versionPublicId } : {}),
      'data-display-mode': 'card',
    }), resourcePublicId
      ? ['a', { href: `/resources/${resourcePublicId}` }, RESOURCE_EMBED_FALLBACK_TEXT]
      : RESOURCE_EMBED_FALLBACK_TEXT];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResourceEmbedNodeView);
  },

  addCommands() {
    return {
      insertResourceEmbed: (attrs) => ({ state, commands }) => {
        const normalized = normalizeCommandAttrs(attrs);
        if (!normalized) return false;
        if (countResourceEmbedNodes(state.doc) >= RESOURCE_EMBED_LIMIT) return false;
        return commands.insertContent({ type: RESOURCE_EMBED_NODE_NAME, attrs: normalized });
      },
    };
  },
});

/** A decoded clipboard blueprint. `raw` is what "keep as plain text" inserts. */
export type ParsedSchematicPaste = {
  raw: string;
  base64: string;
  bytes: Uint8Array;
};

const SCHEMATIC_BASE64_PATTERN = /^bXNja[A-Za-z0-9+/=\s]{80,}$/;
/** Clipboard payloads above this are never inspected; normal `.msch` files are far smaller. */
export const SCHEMATIC_PASTE_MAX_LENGTH = 4_000_000;

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Recognise a Mindustry schematic clipboard string.
 *
 * The game copies `.msch` bytes as Base64; the first four bytes are always the
 * ASCII magic `msch`, which starts the encoded text with `bXNja`. The regex
 * keeps the hot path cheap, but the authoritative check is the decoded header:
 * a string can share the textual prefix and still decode to something else.
 */
export function parseSchematicPaste(value: string): ParsedSchematicPaste | null {
  const raw = value.trim();
  if (!raw || raw.length > SCHEMATIC_PASTE_MAX_LENGTH) return null;
  if (!SCHEMATIC_BASE64_PATTERN.test(raw)) return null;
  const base64 = raw.replace(/\s+/g, '');
  const bytes = decodeBase64(base64);
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] !== 0x6d || bytes[1] !== 0x73 || bytes[2] !== 0x63 || bytes[3] !== 0x68) return null;
  return { raw, base64, bytes };
}

/** Turn a detected paste into the `.msch` file the analyzer and uploader expect. */
export function schematicPasteFile(paste: ParsedSchematicPaste): File {
  const buffer = new ArrayBuffer(paste.bytes.byteLength);
  new Uint8Array(buffer).set(paste.bytes);
  return new File([buffer], 'pasted.msch', { type: 'application/octet-stream' });
}
