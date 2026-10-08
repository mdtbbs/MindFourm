import { test, expect } from '@playwright/test';
import documentFixture from '../fixtures/rich-presentation.json';

import { presentation } from '../helpers/rich-presentation.helpers';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 360, height: 800 }, { width: 412, height: 915 }]) {
  test(`editor / preview / published presentation ${viewport.width}x${viewport.height} (fixture API)`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const snapshot = { timestamp: Date.now(), values: { title: 'Presentation contract 标题', content: 'Presentation compatibility projection', contentJson: documentFixture, status: 'published' } };
    await page.addInitScript((draft) => {
      localStorage.setItem('draft:post:new', JSON.stringify(draft));
      sessionStorage.setItem('rich-attachment:presentation-draft-token', JSON.stringify({ file_name: 'very-long-draft-attachment-name-presentation-contract.txt', mime_type: 'text/plain', file_size: 2048 }));
    }, snapshot);
    await page.goto('/posts/new');
    await page.getByRole('button', { name: /恢复草稿/ }).click();
    const editor = page.getByTestId('post-content-editor');
    await expect(editor.locator('h1')).toHaveText('Heading 1 标题');
    await expect(editor.locator('.rich-attachment-name')).toContainText('very-long-draft');
    const originalSurface = await editor.elementHandle();
    const editorStyles = await presentation(editor);
    await editor.focus();
    if (viewport.width < 640) {
      await expect(page.getByRole('toolbar', { name: '编辑器工具栏' })).toBeVisible();
      expect(await page.getByRole('toolbar', { name: '编辑器工具栏' }).evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    }
    await page.getByTestId('save-local-draft').click();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('draft:post:new')!).values);
    await page.screenshot({ path: testInfo.outputPath(`editor-${viewport.width}.png`), fullPage: true });
    await page.getByTestId('post-preview-tab').click();
    const preview = page.getByTestId('post-preview').getByTestId('rich-content-renderer');
    await expect(preview).toBeVisible();
    expect(await presentation(preview)).toEqual(editorStyles);
    await expect(preview.locator('[data-task-checkbox]').first()).toBeDisabled();
    await expect(editor).toBeHidden();
    await expect(preview.locator('iframe')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`preview-${viewport.width}.png`), fullPage: true });
    const previewWidth = await preview.evaluate((el) => el.getBoundingClientRect().width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    expect(await preview.locator('pre').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await preview.locator('.tableWrapper').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(viewport.width < 640);
    await page.getByTestId('post-editor-tab').click();
    expect(await originalSurface!.evaluate((el) => el.isConnected)).toBe(true);
    await page.getByTestId('save-local-draft').click();
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('draft:post:new')!).values);
    expect(after).toEqual(before); // JSON, projection and draftToken all unchanged.
    await expect(editor.locator('.rich-mention')).toContainText('@presentation-user');
    await expect(editor.locator('[data-type="spoiler"]')).toHaveCount(1);
    await expect(editor.locator('table')).toHaveCount(1);
    await page.getByTestId('post-preview-tab').click();
    const previewStyles = await presentation(preview);
    const request = page.waitForRequest((req) => req.method() === 'POST' && new URL(req.url()).pathname === '/api/posts');
    await page.getByTestId('publish-button').click();
    const input = (await request).postDataJSON();
    expect(input.content_schema_version).toBe(2);
    expect(input.content_json).toEqual(before.contentJson);
    expect(input.content).toBe(before.content.trim());
    await page.waitForURL(/\/posts\/\d+/);
    const published = page.getByTestId('post-content').getByTestId('rich-content-renderer');
    await expect(published).toBeVisible();
    expect(await presentation(published)).toEqual(previewStyles);
    expect(await published.evaluate((el) => el.getBoundingClientRect().width)).toBe(previewWidth);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`published-${viewport.width}.png`), fullPage: true });
    await testInfo.attach('presentation', { body: JSON.stringify({ editor: editorStyles, preview: previewStyles, viewport }), contentType: 'application/json' });
  });
}

test('legacy Markdown shares presentation without prose', async ({ page, request }) => {
  const created = await request.post('http://127.0.0.1:4600/api/posts', { data: { title: 'Legacy presentation', content: '# Legacy heading\n\nParagraph with **bold** and `code`.\n\n- List item\n\n> Quote\n\n| A | B |\n| --- | --- |\n| One | Two |' } });
  const { data } = await created.json();
  await page.goto(`/posts/${data.id}`);
  const root = page.getByTestId('post-content').locator('.mdtbbs-rich-content');
  await expect(root).toBeVisible();
  await expect(root).not.toHaveClass(/\bprose\b/);
  expect(await root.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
  expect(await root.evaluate((el) => getComputedStyle(el).lineHeight)).toBe('28px');
  await expect(root.locator('h1')).toHaveText('Legacy heading');
  expect(await root.locator('ul').evaluate((el) => getComputedStyle(el).listStyleType)).toBe('disc');
});

test('switching preview preserves the editor selection and undo history', async ({ page }) => {
  await page.goto('/posts/new');
  const editor = page.getByTestId('post-content-editor');
  await expect(editor).toBeVisible();
  await editor.fill('alpha');
  // An undo/redo creates an explicit history boundary without timing sleeps.
  await editor.press('ControlOrMeta+z');
  await expect(editor).toHaveText('');
  await editor.press('ControlOrMeta+Shift+z');
  await expect(editor).toHaveText('alpha');
  await editor.press('End');
  await editor.press('ArrowLeft');
  await editor.press('ArrowLeft');
  await page.getByTestId('post-preview-tab').click();
  await expect(page.getByTestId('post-preview')).toContainText('alpha');
  await page.getByTestId('post-editor-tab').click();
  await editor.focus();
  await editor.pressSequentially('X');
  await expect(editor).toHaveText('alpXha');
  await editor.press('ControlOrMeta+z');
  await expect(editor).toHaveText('alpha');
  await editor.press('ControlOrMeta+z');
  await expect(editor).toHaveText('');
});

test('published post edit form uses the same renderer for preview', async ({ page, request }) => {
  const video = documentFixture.content.find((node) => node.type === 'video')!;
  const cardFirst = { ...documentFixture, content: [video, ...documentFixture.content.filter((node) => node.type !== 'video')] };
  const response = await request.post('http://127.0.0.1:4600/api/posts', { data: { title: 'Edit preview fixture', content: 'Edit projection', content_json: cardFirst, content_schema_version: 2 } });
  const { data } = await response.json();
  await page.goto(`/posts/${data.id}/edit`);
  const editor = page.getByTestId('post-content-editor');
  await expect(editor.locator('h1')).toHaveText('Heading 1 标题');
  const cardMargin = await editor.locator('.rich-video-card').evaluate((el) => getComputedStyle(el).marginTop);
  await page.getByTestId('post-preview-tab').click();
  await expect(page.getByTestId('post-preview').getByTestId('rich-content-renderer').locator('h1')).toHaveText('Heading 1 标题');
  expect(await page.getByTestId('post-preview').locator('.rich-video-card').evaluate((el) => getComputedStyle(el).marginTop)).toBe(cardMargin);
  await page.getByTestId('post-editor-tab').click();
  await expect(editor.locator('table')).toHaveCount(1);
  await expect(editor.locator('[data-type="spoiler"]')).toHaveCount(1);
});
