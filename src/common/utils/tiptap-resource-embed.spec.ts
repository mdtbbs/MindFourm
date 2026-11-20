import {
  extractTiptapText,
  normalizeTiptapDocument,
  renderTiptapDocument,
  serializeTiptapToMarkdown,
  type ResourceEmbedProjection,
} from './tiptap-content.util';

const RESOURCE_ID = '4ab5d671-8af6-4d16-8238-7b6fd4b0a240';
const VERSION_ID = '16d81bd0-90c7-48ed-a371-a81059aaddc9';

function document(attrs: Record<string, unknown> = {}) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '说明' }] }, {
      type: 'resourceEmbed',
      attrs: { resourcePublicId: RESOURCE_ID, versionPublicId: VERSION_ID, displayMode: 'card', ...attrs },
    }],
  };
}

describe('Rich Content V2 resourceEmbed', () => {
  it('normalizes the documented node shape and defaults displayMode to card', () => {
    const normalized = normalizeTiptapDocument(document({ displayMode: undefined }), { schemaVersion: 2 });
    expect(normalized.content[1]).toEqual({
      type: 'resourceEmbed',
      attrs: { resourcePublicId: RESOURCE_ID, versionPublicId: VERSION_ID, displayMode: 'card' },
    });
  });

  it('accepts a null or omitted version selector', () => {
    const normalized = normalizeTiptapDocument(document({ versionPublicId: null }), { schemaVersion: 2 });
    expect((normalized.content[1] as any).attrs).toEqual({
      resourcePublicId: RESOURCE_ID, displayMode: 'card',
    });
  });

  it('rejects schema v1 documents and malformed identifiers', () => {
    expect(() => normalizeTiptapDocument(document(), { schemaVersion: 1 }))
      .toThrow(expect.objectContaining({ code: 'UNSUPPORTED_CONTENT_NODE' }));
    expect(() => normalizeTiptapDocument(document({ resourcePublicId: 'not-a-uuid' }), { schemaVersion: 2 }))
      .toThrow(expect.objectContaining({ code: 'INVALID_CONTENT_JSON' }));
    expect(() => normalizeTiptapDocument(document({ versionPublicId: '../../etc/passwd' }), { schemaVersion: 2 }))
      .toThrow(expect.objectContaining({ code: 'INVALID_CONTENT_JSON' }));
    expect(() => normalizeTiptapDocument(document({ displayMode: 'full' }), { schemaVersion: 2 }))
      .toThrow(expect.objectContaining({ code: 'INVALID_CONTENT_JSON' }));
  });

  it('enforces at most ten cards per document', () => {
    const many = {
      type: 'doc',
      content: Array.from({ length: 11 }, () => ({
        type: 'resourceEmbed', attrs: { resourcePublicId: RESOURCE_ID, displayMode: 'card' },
      })),
    };
    expect(() => normalizeTiptapDocument(many, { schemaVersion: 2 }))
      .toThrow(expect.objectContaining({ code: 'RESOURCE_EMBED_LIMIT_EXCEEDED' }));
    expect(() => normalizeTiptapDocument({ ...many, content: many.content.slice(0, 10) }, { schemaVersion: 2 })).not.toThrow();
  });

  it('projects an unhydrated semantic container and UUID placeholder', () => {
    const html = renderTiptapDocument(document(), { schemaVersion: 2 });
    expect(html).toContain('data-resource-embed="' + RESOURCE_ID + '"');
    expect(html).toContain('data-resource-version="' + VERSION_ID + '"');
    expect(html).toContain('href="/resources/' + RESOURCE_ID + '"');
    expect(renderTiptapDocument(document(), { schemaVersion: 2 })).not.toContain(RESOURCE_ID + '" >');
    expect(serializeTiptapToMarkdown(document())).toContain('[资源卡片: ' + RESOURCE_ID + ']');
    expect(extractTiptapText(document())).toContain('[资源卡片: ' + RESOURCE_ID + ']');
  });

  it('uses hydrated titles in HTML and text but never leaks an unavailable title', () => {
    const available: ResourceEmbedProjection = {
      [RESOURCE_ID]: { title: '铜墙阵列 <测试>', kind: 'schematic', status: 'available' },
    };
    const html = renderTiptapDocument(document(), { schemaVersion: 2, resourceEmbeds: available });
    expect(html).toContain('[资源卡片: 铜墙阵列 &lt;测试&gt; (schematic)]');
    expect(extractTiptapText(document(), available)).toContain('[资源卡片: 铜墙阵列 <测试> (schematic)]');

    const unavailable: ResourceEmbedProjection = {
      [RESOURCE_ID]: { title: '不应出现', kind: 'schematic', status: 'unavailable' },
    };
    const hidden = renderTiptapDocument(document(), { schemaVersion: 2, resourceEmbeds: unavailable });
    expect(hidden).toContain('资源卡片不可用');
    expect(hidden).not.toContain('不应出现');
    expect(extractTiptapText(document(), unavailable)).toContain('[资源卡片: 不可用]');
  });

  it('allows the node in doc/list containers but not inside a blockquote', () => {
    const inList = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{ type: 'listItem', content: [
          { type: 'paragraph', content: [] },
          { type: 'resourceEmbed', attrs: { resourcePublicId: RESOURCE_ID, displayMode: 'card' } },
        ] }],
      }],
    };
    expect(() => normalizeTiptapDocument(inList, { schemaVersion: 2 })).not.toThrow();
    const inQuote = {
      type: 'doc',
      content: [{ type: 'blockquote', content: [
        { type: 'paragraph', content: [] },
        { type: 'resourceEmbed', attrs: { resourcePublicId: RESOURCE_ID, displayMode: 'card' } },
      ] }],
    };
    expect(() => normalizeTiptapDocument(inQuote, { schemaVersion: 2 }))
      .toThrow(expect.objectContaining({ code: 'INVALID_CONTENT_JSON' }));
  });
});
