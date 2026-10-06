import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WaveEditor from '../../../frontend/src/components/forum/resources/workbench/wave-editor';

describe('WaveEditor contract', () => {
  it('renders the primary wave controls and touch-sized actions', () => {
    const markup = renderToStaticMarkup(createElement(WaveEditor, {
      groups: [{
        type: 'dagger', begin: 1, end: 40, spacing: 2, amount: 3,
        max: 12, scaling: 1.5, shields: 10, shieldScaling: 2,
        spawn: -1, team: 2, effect: 'overdrive', payloads: ['flare'],
        items: { item: 'copper', amount: 10 },
      }],
      onGroupsChange: () => undefined,
      onOperation: () => undefined,
    }));

    expect(markup).toContain('波次编辑器');
    expect(markup).toContain('1 个波次组');
    expect(markup).toContain('单位');
    expect(markup).toContain('开始波次');
    expect(markup).toContain('结束波次');
    expect(markup).toContain('间隔');
    expect(markup).toContain('初始数量');
    expect(markup).toContain('数量上限');
    expect(markup).toContain('数量增长');
    expect(markup).toContain('初始护盾');
    expect(markup).toContain('展开高级字段');
    expect(markup).toContain('min-h-11');
    expect(markup).toContain('复制');
    expect(markup).toContain('删除');
  });

  it('keeps all renderer-supported advanced wave fields in the editor contract', () => {
    const source = readFileSync(join(
      process.cwd(),
      'frontend/src/components/forum/resources/workbench/wave-editor.tsx',
    ), 'utf8');

    for (const field of ['shieldScaling', 'spawn', 'team', 'effect', 'payloads', 'items']) {
      expect(source).toContain(field);
    }
    expect(source).toContain('收起高级字段');
    expect(source).toContain('载荷');
    expect(source).toContain('携带物品');
  });

  it('keeps the empty state actionable', () => {
    const markup = renderToStaticMarkup(createElement(WaveEditor, {
      groups: [],
      onGroupsChange: () => undefined,
      onOperation: () => undefined,
    }));

    expect(markup).toContain('当前地图没有波次组，可以直接添加');
    expect(markup).toContain('添加波次组');
  });
});
