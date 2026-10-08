import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_URL, testLogin } from '../helpers/content.helpers';

const blueprint = join(process.cwd(), 'tools/mindustry-renderer/src/test/resources/schematics/official-v160.5-item-power.msch');
const map = join(process.cwd(), 'tests/fixtures/editor-map.msav');
const unwrap = (value: any): any => value?.data?.data ?? value?.data ?? value;
async function assertOk(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  expect(response.ok(), `${response.status()} ${await response.text()}`).toBeTruthy();
  return unwrap(await response.json());
}
async function analyzeDownload(request: APIRequestContext, filename: string, bytes: Buffer, kind: string) {
  await request.get(`${API_URL}/api/auth/check`);
  const state = await request.storageState(); const csrf = state.cookies.find(cookie => cookie.name === 'csrf_token')!.value;
  return assertOk(await request.post(`${API_URL}/api/resources/editor/${kind}/analyze`, { headers: { 'X-CSRF-Token': csrf }, multipart: { file: { name: filename, mimeType: 'application/octet-stream', buffer: bytes } } }));
}

test.describe.configure({ mode: 'serial' });
test('anonymous local blueprint editing supports undo, redo and an official reload', async ({ page, request }) => {
  await page.goto('/tools/blueprint-editor');
  await page.getByLabel('上传编辑文件').setInputFiles(blueprint);
  await expect(page.getByRole('grid')).toBeVisible();
  await page.getByRole('button', { name: '整体右转', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '重做', exact: true }).click();
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: '下载 .msch', exact: true }).click();
  const file = await downloaded; const parsed = await analyzeDownload(request, file.suggestedFilename(), readFileSync((await file.path())!), 'schematic');
  expect(parsed.metadata.block_count).toBe(15);
  expect(parsed.metadata.width).toBe(6);
  await expect(page.getByRole('button', { name: '登录后发布', exact: true })).toBeDisabled();
});

test('anonymous local map wave import, undo and export preserve official map data', async ({ page, request }) => {
  await page.goto('/tools/wave-editor');
  await page.getByLabel('上传编辑文件').setInputFiles(map);
  await expect(page.getByRole('heading', { name: '波次编辑器', exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: '下载 .msav', exact: true })).toBeEnabled();
  await page.getByLabel('导入波次配置').setInputFiles({ name: 'waves.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ groups: [{ type: 'dagger', begin: 0, end: 9, spacing: 1, amount: 3, payloads: ['flare'], items: { item: 'copper', amount: 12 } }] })) });
  await expect(page.getByText(/^1 个波次组。/)).toBeVisible();
  await expect(page.getByText('地形 0 · 规则 0 · 波次 20 · 对象 0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '撤销', exact: true }).first().click();
  await page.getByRole('button', { name: '重做', exact: true }).first().click();
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: '下载 .msav', exact: true }).click();
  const file = await downloaded; const parsed = await analyzeDownload(request, file.suggestedFilename(), readFileSync((await file.path())!), 'map');
  expect(parsed.metadata.rules.spawns).toHaveLength(1);
  expect(parsed.metadata.rules.spawns[0]).toMatchObject({ type: 'dagger', amount: 3, payloads: ['flare'], items: { item: 'copper', amount: 12 } });
  expect(parsed.metadata.width).toBeGreaterThan(0);
});

test('public resource detail opens the editor directly and visitors can export without owning it', async ({ page, request }) => {
  const admin = await testLogin(request, 'admin'); const headers = { Cookie: admin.cookieHeader, 'X-CSRF-Token': admin.csrfToken };
  const creation = await request.post(`${API_URL}/api/resources`, { headers: { ...headers, 'Idempotency-Key': `editor-${Date.now()}` }, multipart: { title: `公开蓝图编辑验收 ${Date.now()}`, resource_kind: 'schematic', resource_type: 'upload', version: '1.0.0', is_public: '1', content: '编辑副本验收', file: { name: 'source.msch', mimeType: 'application/octet-stream', buffer: readFileSync(blueprint) } } });
  const created = creation.status() === 409 ? (await creation.json()).existing_resource : await assertOk(creation);
  const resource = created.resource || created; const publicId = resource.public_id;
  await assertOk(await request.put(`${API_URL}/api/resources/${resource.id}/status`, { headers, data: { status: 'approved' } }));
  const pending = await assertOk(await request.get(`${API_URL}/api/v1/resources/${publicId}/workbench`, { headers }));
  const version = pending.versions[0];
  if (version.status !== 'published') await assertOk(await request.post(`${API_URL}/api/v1/resources/${publicId}/versions/${version.public_id}/review`, { headers, data: { action: 'approve' } }));
  await page.goto(`/resources/${publicId}`);
  const entry = page.getByRole('link', { name: /在蓝图编辑器中打开/ });
  await expect(entry).toHaveAttribute('href', new RegExp(`/tools/blueprint-editor\\?resource=${publicId}`));
  await entry.click(); await expect(page).toHaveURL(/\/tools\/blueprint-editor\?/);
  await expect(page.getByRole('grid')).toBeVisible();
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: '下载 .msch', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.msch$/);
  await expect(page.getByRole('button', { name: '保存为新版本', exact: true })).toHaveCount(0);
  const unchanged = await assertOk(await request.get(`${API_URL}/api/v1/resources/${publicId}/workbench`, { headers }));
  expect(unchanged.versions).toHaveLength(1);
  const visitor = await testLogin(request, 'user');
  const editorOrigin = new URL(page.url()).origin;
  await page.context().addCookies([{ name: 'forum_session', value: visitor.cookieHeader.split('forum_session=')[1], url: editorOrigin }, { name: 'csrf_token', value: visitor.csrfToken, url: editorOrigin }]);
  await page.reload();
  await expect(page.getByRole('button', { name: '发布为我的资源', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '整体左转', exact: true }).click();
  await page.getByRole('button', { name: '水平镜像', exact: true }).click();
  await page.getByLabel('发布副本名称').fill(`玩家编辑副本 ${Date.now()}`);
  await page.getByRole('button', { name: '发布为我的资源', exact: true }).click();
  await expect(page).toHaveURL(/\/resources\/[0-9a-f-]{36}\/workbench/, { timeout: 30000 });
  const copyId = new URL(page.url()).pathname.split('/')[2];
  expect(copyId).not.toBe(publicId);
  const copy = await assertOk(await request.get(`${API_URL}/api/v1/resources/${copyId}/workbench`, { headers: { Cookie: visitor.cookieHeader } }));
  expect(copy.permissions.role).toBe('owner');
  expect(copy.versions[0].status).toBe('pending_review');
  const stillOriginal = await assertOk(await request.get(`${API_URL}/api/v1/resources/${publicId}/workbench`, { headers }));
  expect(stillOriginal.versions).toHaveLength(1);

});

test('mobile tools keep actions reachable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/tools/blueprint-editor'); await page.getByLabel('上传编辑文件').setInputFiles(blueprint);
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(page.getByRole('button', { name: '下载 .msch', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
});
