import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildWaveOperations, EDITOR_RULE_SCHEMA, ruleValue, validateObjectPosition,
  type MapEditorObject, type WaveGroup,
} from './editor-model';
import { createEditorHistory, pushEditorHistory, redoEditorHistory, undoEditorHistory } from './editor-history';

describe('editor model contracts', () => {
  it('keeps every Renderer-supported Rules field in the player schema', () => {
    const source = readFileSync(resolve(process.cwd(), 'tools/mindustry-renderer/src/main/java/cn/mdtbbs/renderer/MapRenderer.java'), 'utf8');
    const start = source.indexOf('private static void applyRuleChanges(');
    const end = source.indexOf('for (JsonValue change = changes.child', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const rendererKeys = [...source.slice(start, end).matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map((match) => match[1]);
    rendererKeys.push('modeName'); // the scalar mode field is selected by the same method's explicit branch.
    expect(new Set(EDITOR_RULE_SCHEMA.map((field) => field.key))).toEqual(new Set(rendererKeys));
  });

  it('uses runtime Rules defaults without writing them into edits', () => {
    expect(ruleValue({}, 'waveTimer', { waveTimer: false })).toBe(false);
    expect(ruleValue({}, 'deconstructRefundMultiplier')).toBe(0.5);
    expect(ruleValue({}, 'itemDepositCooldown', { itemDepositCooldown: 0.25 })).toBe(0.25);
  });

  it('compacts 1,500 edits to one wave group into one final update', () => {
    const original: WaveGroup = { __editor_id: 'source:0', type: 'dagger', begin: 1, end: 1, amount: 1 };
    let edited = { ...original };
    for (let index = 1; index <= 1_500; index++) edited = { ...edited, amount: index };
    const operations = buildWaveOperations([original], [edited]);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ action: 'update', index: 0, fields: { amount: 1_500 } });
  });

  it('keeps wave add, delete and move indexes consistent', () => {
    const original: WaveGroup[] = [
      { __editor_id: 'a', type: 'dagger', begin: 1, end: 1, amount: 1 },
      { __editor_id: 'b', type: 'crawler', begin: 1, end: 1, amount: 1 },
      { __editor_id: 'c', type: 'flare', begin: 1, end: 1, amount: 1 },
    ];
    const added: WaveGroup = { __editor_id: 'new', type: 'nova', begin: 2, end: 2, amount: 3 };
    expect(buildWaveOperations(original, [original[2], added, original[0]])).toEqual([
      { action: 'delete', index: 1 },
      { action: 'move', index: 1, to_index: 0 },
      { action: 'add', index: 1, fields: { type: 'nova', begin: 2, end: 2, amount: 3 } },
    ]);
  });

  it('checks map object bounds and multiblock overlap with renderer footprint offsets', () => {
    const core = (id: string, x: number, y: number): MapEditorObject => ({
      id, object_type: 'core', original_x: x, original_y: y, x, y, name: 'core-shard', team: 'sharded',
      rotation: 0, size: 3, size_offset: -1, rotatable: true, added: false, editable: true,
      movable: true, deletable: true, team_editable: true, reason: null,
    });
    expect(validateObjectPosition(core('a', 1, 1), 10, 10, [])).toBeNull();
    expect(validateObjectPosition(core('a', 0, 1), 10, 10, [])).toContain('超出地图边界');
    expect(validateObjectPosition(core('a', 4, 4), 10, 10, [core('b', 6, 4)])).toContain('重叠');
  });

  it('undoes and redoes edits within the shared history model', () => {
    const first = createEditorHistory({ amount: 1 });
    const second = pushEditorHistory(first, { amount: 2 });
    expect(undoEditorHistory(second).present).toEqual({ amount: 1 });
    expect(redoEditorHistory(undoEditorHistory(second)).present).toEqual({ amount: 2 });
  });
});
