import { ApiV1Exception } from '../exceptions/api-v1.exception';
import { sanitize } from './markdown.util';
import {
  applyBattleReportMetadata,
  battleReportSummaryText,
  collectBattleReportPublicIds,
  extractTiptapText,
  normalizeTiptapDocument,
  renderTiptapDocument,
  serializeTiptapToMarkdown,
} from './tiptap-content.util';

const ID_A = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const ID_C = 'a3bb189e-8bf9-4f5f-991e-2b3f6f55b4a3';
const ID_D = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';

const battleReport = (attrs: Record<string, unknown> = {}) => ({
  type: 'battleReport',
  attrs: { timelapsePublicId: ID_A, ...attrs },
});
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const documentOf = (...content: Record<string, unknown>[]) => ({ type: 'doc', content });

function expectSchemaError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiV1Exception);
    expect((error as ApiV1Exception).code).toBe(code);
    expect((error as ApiV1Exception).getStatus()).toBe(400);
    return;
  }
  throw new Error('预期抛出 ' + code + '，但调用成功');
}

describe('battleReport 节点（Rich Content Schema v2）', () => {
  it('接受合法节点并规范化属性', () => {
    const normalized = normalizeTiptapDocument(documentOf(
      battleReport({ mapName: '沙漠绿洲', maxWave: 35 }),
      battleReport({ timelapsePublicId: ID_B }),
      battleReport({ timelapsePublicId: ID_C, maxWave: 0 }),
    ), { schemaVersion: 2 });
    expect(normalized.content[0]).toEqual({
      type: 'battleReport',
      attrs: { timelapsePublicId: ID_A, mapName: '沙漠绿洲', maxWave: 35 },
    });
    // 缺省 mapName/maxWave 时仍保留必填的身份属性。
    expect(normalized.content[1]).toEqual({ type: 'battleReport', attrs: { timelapsePublicId: ID_B } });
    expect(normalized.content[2]).toMatchObject({ attrs: { timelapsePublicId: ID_C, maxWave: 0 } });
    // maxWave 上界单独验证。
    const maxWaveBoundary = normalizeTiptapDocument(documentOf(battleReport({ timelapsePublicId: ID_D, maxWave: 1_000_000 })), { schemaVersion: 2 });
    expect(maxWaveBoundary.content[0]).toMatchObject({ attrs: { timelapsePublicId: ID_D, maxWave: 1_000_000 } });
    // 大写 UUID 也符合契约（正则大小写不敏感），值保持原样。
    expect(() => normalizeTiptapDocument(documentOf(battleReport({ timelapsePublicId: ID_A.toUpperCase() })), { schemaVersion: 2 })).not.toThrow();
  });

  it('拒绝缺失或非法的身份属性、未知属性与越界元数据', () => {
    const nodes: Array<Record<string, unknown>> = [];
    // attrs 整体缺失。
    nodes.push({ type: 'battleReport' });
    const invalidAttrs: Array<Record<string, unknown>> = [
      {},
      { timelapsePublicId: null },
      { timelapsePublicId: 'not-a-uuid' },
      { timelapsePublicId: ID_A.replace('469f', '069f') },
      { timelapsePublicId: ID_A.replace('a165', 'c165') },
      { timelapsePublicId: ID_A, videoUrl: 'https://cdn.example.org/report.mp4' },
      { timelapsePublicId: ID_A, src: 'https://cdn.example.org/report.mp4' },
      { timelapsePublicId: ID_A, mapName: 'x'.repeat(161) },
      { timelapsePublicId: ID_A, mapName: 42 },
      { timelapsePublicId: ID_A, maxWave: -1 },
      { timelapsePublicId: ID_A, maxWave: 1_000_001 },
      { timelapsePublicId: ID_A, maxWave: 3.5 },
      { timelapsePublicId: ID_A, maxWave: '35' },
    ];
    for (const attrs of invalidAttrs) nodes.push({ type: 'battleReport', attrs });
    // atom 节点不允许携带子节点。
    nodes.push({ type: 'battleReport', attrs: { timelapsePublicId: ID_A }, content: [paragraph('不应存在')] });

    for (const node of nodes) {
      expectSchemaError(() => normalizeTiptapDocument(documentOf(node), { schemaVersion: 2 }), 'INVALID_CONTENT_JSON');
    }
    // 空 content 数组会被规范化丢弃，节点仍保持 atom 形态。
    const emptyContent = normalizeTiptapDocument(documentOf({ type: 'battleReport', attrs: { timelapsePublicId: ID_A }, content: [] }), { schemaVersion: 2 });
    expect(emptyContent.content[0]).toEqual({ type: 'battleReport', attrs: { timelapsePublicId: ID_A } });
  });

  it('每篇正文最多包含 3 个战报节点', () => {
    const reports = [ID_A, ID_B, ID_C, ID_D].map((timelapsePublicId) => battleReport({ timelapsePublicId }));
    expect(() => normalizeTiptapDocument(documentOf(...reports.slice(0, 3)), { schemaVersion: 2 })).not.toThrow();
    expectSchemaError(() => normalizeTiptapDocument(documentOf(...reports), { schemaVersion: 2 }), 'BATTLE_REPORT_LIMIT_EXCEEDED');
  });

  it('只允许作为 doc、表格单元格、列表项与剧透区块的子节点', () => {
    const accepted = [
      documentOf(battleReport()),
      documentOf({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [battleReport()] }] }] }),
      documentOf({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [battleReport()] }] }] }),
      documentOf({ type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('列表'), battleReport()] }] }),
      documentOf({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [paragraph('任务'), battleReport()] }] }),
      documentOf({ type: 'spoiler', attrs: { title: '战报', open: false }, content: [paragraph('剧透'), battleReport()] }),
    ];
    for (const document of accepted) {
      expect(() => normalizeTiptapDocument(document, { schemaVersion: 2 })).not.toThrow();
    }
    expectSchemaError(() => normalizeTiptapDocument(documentOf({ type: 'blockquote', content: [battleReport()] }), { schemaVersion: 2 }), 'INVALID_CONTENT_JSON');
  });

  it('Schema v1 文档中的 battleReport 会被拒绝', () => {
    expectSchemaError(() => normalizeTiptapDocument(documentOf(battleReport()), { schemaVersion: 1 }), 'UNSUPPORTED_CONTENT_NODE');
  });

  it('HTML 投影输出 figure/公开 ID/摘要文本，且绝不包含视频地址', () => {
    const html = renderTiptapDocument(documentOf(battleReport({ mapName: '沙漠绿洲', maxWave: 35 })), { schemaVersion: 2 });
    expect(html).toContain('<figure data-battle-report="1" data-timelapse-public-id="' + ID_A + '">');
    expect(html).toContain('<a href="/timelapses/' + ID_A + '"');
    expect(html).toContain('基地延时战报: 沙漠绿洲 · 最高 35 波');
    expect(html).not.toContain('.mp4');
    expect(html).not.toContain('video_url');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('src="');

    const fallback = renderTiptapDocument(documentOf(battleReport()), { schemaVersion: 2 });
    expect(fallback).toContain('>基地延时战报</a>');
    expect(fallback).toContain('data-timelapse-public-id="' + ID_A + '"');
  });

  it('纯文本投影精确匹配契约格式', () => {
    expect(extractTiptapText(documentOf(battleReport({ mapName: '沙漠绿洲', maxWave: 35 }))))
      .toBe('[基地延时战报: 沙漠绿洲 · 最高 35 波]');
    expect(extractTiptapText(documentOf(battleReport()))).toBe('[基地延时战报]');
    expect(extractTiptapText(documentOf(paragraph('前文'), battleReport({ mapName: '沙漠绿洲', maxWave: 35 }), paragraph('后文'))))
      .toBe('前文\n[基地延时战报: 沙漠绿洲 · 最高 35 波]\n后文');
  });

  it('Markdown 投影精确匹配契约格式', () => {
    expect(serializeTiptapToMarkdown(documentOf(paragraph('正文'), battleReport({ mapName: '沙漠绿洲', maxWave: 35 }))))
      .toBe('正文\n\n[基地延时战报: 沙漠绿洲 · 最高 35 波](/timelapses/' + ID_A + ')');
    expect(serializeTiptapToMarkdown(documentOf(battleReport())))
      .toBe('[基地延时战报](/timelapses/' + ID_A + ')');
  });

  it('摘要文本按属性组合退化', () => {
    expect(battleReportSummaryText({ mapName: '沙漠绿洲', maxWave: 35 })).toBe('基地延时战报: 沙漠绿洲 · 最高 35 波');
    expect(battleReportSummaryText({ timelapsePublicId: ID_A })).toBe('基地延时战报');
    expect(battleReportSummaryText({ timelapsePublicId: ID_A, mapName: '', maxWave: 0 })).toBe('基地延时战报');
    expect(battleReportSummaryText({ mapName: '沙漠绿洲' })).toBe('基地延时战报: 沙漠绿洲');
    expect(battleReportSummaryText({ maxWave: 12 })).toBe('基地延时战报: 最高 12 波');
  });

  it('collectBattleReportPublicIds 去重并保持出现顺序', () => {
    const ids = collectBattleReportPublicIds(documentOf(
      battleReport({ timelapsePublicId: ID_A }),
      { type: 'spoiler', attrs: { title: '战报', open: false }, content: [paragraph('剧透'), battleReport({ timelapsePublicId: ID_B })] },
      battleReport({ timelapsePublicId: ID_A }),
    ));
    expect(ids).toEqual([ID_A, ID_B]);
    expectSchemaError(() => collectBattleReportPublicIds(documentOf({ type: 'battleReport', attrs: {} })), 'INVALID_CONTENT_JSON');
  });

  it('applyBattleReportMetadata 覆盖客户端伪造的 mapName/maxWave', () => {
    const input = documentOf(
      battleReport({ timelapsePublicId: ID_A, mapName: '客户端伪造', maxWave: 999 }),
      battleReport({ timelapsePublicId: ID_B, mapName: '伪造 2', maxWave: 123 }),
    );
    const metadata = new Map([[ID_A, { mapName: '真实地图', maxWave: 88 }]]);
    const applied = applyBattleReportMetadata(input, metadata);
    expect(applied.content[0].attrs).toEqual({ timelapsePublicId: ID_A, mapName: '真实地图', maxWave: 88 });
    // 元数据缺失时写入空字符串和 0，客户端伪造值不会残留。
    expect(applied.content[1].attrs).toEqual({ timelapsePublicId: ID_B, mapName: '', maxWave: 0 });
    expect(extractTiptapText(applied)).toBe('[基地延时战报: 真实地图 · 最高 88 波]\n[基地延时战报]');
    expect(() => normalizeTiptapDocument(applied, { schemaVersion: 2 })).not.toThrow();
  });

  it('sanitize 保留合法的 figure 属性并丢弃伪造属性', () => {
    const safe = sanitize('<figure data-battle-report="1" data-timelapse-public-id="' + ID_A + '" onclick="alert(1)"><figcaption>战报</figcaption></figure>');
    expect(safe).toContain('<figure data-battle-report="1" data-timelapse-public-id="' + ID_A + '">');
    expect(safe).toContain('<figcaption>战报</figcaption>');
    expect(safe).not.toContain('onclick');

    const forged = sanitize('<figure data-battle-report="1" data-timelapse-public-id="not-a-uuid">x</figure>');
    expect(forged).toContain('<figure data-battle-report="1">');
    expect(forged).not.toContain('data-timelapse-public-id');
  });
});
