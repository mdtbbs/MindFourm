import { test, expect, type Page } from '@playwright/test';

const editorStatus = {
  schematic: { enabled: true, reason: null, full_logic: true },
  map: { enabled: true, reason: null },
  wave: { enabled: true, reason: null },
};

const catalog = {
  blocks: [
    { internal_name: 'stone', display_name: '石头', icon: null, size: 1, size_offset: 0, category_name: '地形', placeable: false, floor: true, overlay: false },
    { internal_name: 'darksand', display_name: '暗沙', icon: null, size: 1, size_offset: 0, category_name: '地形', placeable: false, floor: true, overlay: false },
    { internal_name: 'router', display_name: '路由器', icon: null, size: 1, size_offset: 0, category_name: '分配器', placeable: true, floor: false, overlay: false, config_types: [] },
    { internal_name: 'conveyor', display_name: '传送带', icon: null, size: 1, size_offset: 0, category_name: '运输', placeable: true, floor: false, overlay: false, config_types: [] },
    { internal_name: 'core-shard', display_name: '核心：碎片', icon: null, size: 3, size_offset: -1, category_name: '核心', placeable: true, floor: false, overlay: false, core: true },
    { internal_name: 'spawn', display_name: '敌人出生点', icon: null, size: 1, size_offset: 0, category_name: '环境', placeable: true, floor: false, overlay: false, spawn: true },
  ],
  items: [{ internal_name: 'copper', display_name: '铜', icon: null }],
  liquids: [],
  units: [
    { internal_name: 'dagger', display_name: '尖刀', icon: null },
    { internal_name: 'crawler', display_name: '爬虫', icon: null },
  ],
  statuses: [{ internal_name: 'overdrive', display_name: '超速', icon: null }],
  teams: [
    { internal_name: 'sharded', display_name: '秩序', icon: null, id: 0 },
    { internal_name: 'crux', display_name: '侵蚀', icon: null, id: 1 },
  ],
  rule_defaults: { waveTimer: true, waves: true, infiniteResources: false },
};

function envelope(data: unknown) {
  return { data, meta: { request_id: 'editor-e2e' } };
}

async function installEditorApiMocks(page: Page) {
  await page.route('**/api/v1/editor-tools/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/status')) return route.fulfill({ json: envelope(editorStatus) });
    if (path.endsWith('/content-catalog')) return route.fulfill({ json: envelope(catalog) });
    if (path.endsWith('/schematic/create') || path.endsWith('/map/create')) {
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from('mock-official-file') });
    }
    if (path.endsWith('/schematic/export') || path.endsWith('/map/export')) {
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from('mock-renderer-export') });
    }
    if (path.endsWith('/schematic/analyze')) {
      return route.fulfill({ json: envelope({ resource_kind: 'schematic', file_name: '新建文件.msch', sha256: 'mock', parser_version: 'v160.5', renderer_metadata: {
        width: 8, height: 8, block_positions: [{ x: 2, y: 2, block: 'router', rotation: 0, size: 1, size_offset: 0, config: null, config_editable: true }],
      } }) });
    }
    if (path.endsWith('/map/analyze')) {
      const terrain = Array.from({ length: 16 }, (_, index) => ({ x: index % 4, y: Math.floor(index / 4), name: 'stone', overlay: 'air' }));
      return route.fulfill({ json: envelope({ resource_kind: 'map', file_name: '新建文件.msav', sha256: 'mock', parser_version: 'v160.5', renderer_metadata: {
        width: 4, height: 4, core_count: 0, cores: [], core_teams: [], unknown_content: [],
        tile_layers_truncated: false,
        tile_layers: { terrain, resources: [], ores: [], enemy_spawns: [], buildings: [], liquid: [], objects_truncated: false },
        rules: { spawns: [] },
      } }) });
    }
    return route.fulfill({ status: 404, json: envelope({ error: 'unexpected editor request' }) });
  });
}

test.describe('independent editor workspaces', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the editor smoke uses Chromium desktop and touch emulation');

  test('all three tool URLs open their own ready workspace', async ({ page }) => {
    await installEditorApiMocks(page);
    for (const [path, title, fileLabel] of [
      ['/tools/blueprint-editor', '蓝图编辑器', '上传 .msch 文件'],
      ['/tools/map-editor', '地图编辑器', '上传 .msav 文件'],
      ['/tools/wave-editor', '波次编辑器', '上传 .msav 文件'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await expect(page.getByRole('button', { name: new RegExp(fileLabel) })).toBeVisible();
      await expect(page.getByText('在线编辑暂不可用')).toHaveCount(0);
    }
  });

  test('desktop blueprint canvas supports placement and history controls', async ({ page }) => {
    await installEditorApiMocks(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/tools/blueprint-editor');
    await page.getByRole('button', { name: '创建并编辑' }).click();
    const canvas = page.getByRole('grid', { name: '蓝图画布' });
    await expect(canvas).toBeVisible();
    await page.getByRole('option', { name: /传送带/ }).click();
    await canvas.click({ position: { x: 140, y: 140 } });
    await expect(page.getByText(/有未导出更改/)).toBeVisible();
    await page.getByRole('button', { name: '撤销' }).click();
    await page.getByRole('button', { name: '重做' }).click();
    await expect(canvas.locator('[role="gridcell"]')).toHaveCount(2);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出' }).click();
    expect((await download).suggestedFilename()).toBe('新建文件.msch');
  });

  test('wave editor adds a localized unit group and exports the map file', async ({ page }) => {
    await installEditorApiMocks(page);
    await page.goto('/tools/wave-editor');
    await page.getByRole('button', { name: '创建并编辑' }).click();
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByText('波次组 1')).toBeVisible();
    await expect(page.getByText('尖刀', { exact: true }).first()).toBeVisible();
    await page.getByLabel('每次数量').fill('4');
    await expect(page.getByLabel('每次数量')).toHaveValue('4');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出' }).click();
    expect((await download).suggestedFilename()).toBe('新建文件.msav');
  });
});

test.describe('mobile map editor workspace', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the editor smoke uses Chromium desktop and touch emulation');
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('terrain brush and inspector remain usable at 375px', async ({ page }) => {
    await installEditorApiMocks(page);
    await page.goto('/tools/map-editor');
    await page.getByRole('button', { name: '创建并编辑' }).click();
    const canvas = page.getByRole('grid', { name: '地图画布' });
    await expect(canvas).toBeVisible();
    await page.getByRole('button', { name: '地形', exact: true }).click();
    await page.getByRole('option', { name: /暗沙/ }).click();
    await canvas.tap({ position: { x: 36, y: 36 } });
    await page.getByRole('button', { name: '建筑', exact: true }).click();
    await page.getByRole('option', { name: /路由器/ }).click();
    await canvas.tap({ position: { x: 60, y: 60 } });
    await expect(canvas.locator('g[aria-label^="路由器"]')).toHaveCount(1);
    await expect(page.getByText(/有未导出更改/)).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('button', { name: '规则' })).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: '规则' }).click();
    await expect(page.getByLabel('波次计时器')).toBeVisible();
    const main = page.locator('main').first();
    const widths = await main.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  });
});
