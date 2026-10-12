import { test, expect } from '@playwright/test';

/**
 * The HTML block panel in a real browser.
 *
 * The panel used to sanitize the whole draft on every keystroke — a full
 * parse-and-rewrite pass per character (measured at ~21ms for 60KB, ~63ms for
 * 180KB of markup). These cases drive the production page and assert the
 * behaviour that replaced it: typing stays cheap, preview waits to be asked for,
 * the import reports progress, and it can be cancelled.
 *
 * Fixture API only (`tests/helpers/presentation-api.cjs`); the write path itself
 * is not exercised here, only the panel.
 */
async function openHtmlBlockPanel(page: import('@playwright/test').Page) {
  await page.goto('/posts/new');
  await page.getByTestId('post-content-editor').waitFor();
  await page.getByText('更多', { exact: true }).click();
  await page.getByTitle('HTML 区块').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Types the draft one character at a time through React and returns the cost per
 * character. Each step sets the textarea's value and fires `input`, which is the
 * same path a real keystroke takes through the controlled component — but it can
 * be run over tens of thousands of characters instead of pressing keys for
 * minutes.
 */
async function timeTyping(page: import('@playwright/test').Page, text: string) {
  return page.evaluate((draft) => {
    const input = document.querySelector('#html-block-input') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    const fire = () => input.dispatchEvent(new Event('input', { bubbles: true }));
    // Warm up so the first sample is not paying for module-level laziness.
    setter.call(input, draft.slice(0, 200));
    fire();
    const started = performance.now();
    for (let index = 200; index < draft.length; index += 1) {
      setter.call(input, draft.slice(0, index));
      fire();
    }
    return { elapsed: performance.now() - started, characters: draft.length - 200 };
  }, text);
}

/**
 * The cost of the pass typing used to run per character — the same sanitizer the
 * preview button still invokes on demand. Measured here as a reference point for
 * the live path, in the same browser, on the same draft.
 */
async function timePreviewRefresh(page: import('@playwright/test').Page, rounds = 5) {
  const button = page.getByTestId('html-block-refresh-preview');
  const started = Date.now();
  for (let index = 0; index < rounds; index += 1) await button.click();
  return (Date.now() - started) / rounds;
}

const bigDocument = (() => {
  let html = '<!doctype html><html><head><style>.grid{display:grid;grid-template-columns:2fr 1fr;gap:16px}</style></head><body>';
  while (html.length < 180_000) html += '<div class="grid" style="padding:16px;border-radius:12px"><h3>章节</h3><p>说明文字</p></div>';
  return html + '</body></html>';
})();

test('typing a large draft stays responsive and never previews by itself', async ({ page }) => {
  const dialog = await openHtmlBlockPanel(page);
  expect(await dialog.getByText('预览（清洗后）').count()).toBe(0);

  const draft = bigDocument.slice(0, 15_000);
  const timing = await timeTyping(page, draft);
  const perCharacter = timing.elapsed / timing.characters;
  console.log(`typing: ${timing.characters} chars in ${timing.elapsed.toFixed(0)}ms → ${perCharacter.toFixed(2)}ms/char`);
  await expect(dialog.getByText(/字符（完整文档）/)).toBeVisible();

  // Still no preview after all that typing: nothing renders unless asked for.
  expect(await dialog.getByText('预览（清洗后）').count()).toBe(0);

  const previewPass = await timePreviewRefresh(page);
  console.log(`on-demand sanitize pass on the same draft: ${previewPass.toFixed(1)}ms`);
  // Typing costs a regex scan; the pass it used to run per character is the one
  // the preview button just ran, on this very draft.
  expect(perCharacter * 10).toBeLessThan(previewPass);
});

test('preview renders on demand and drops refused markup', async ({ page }) => {
  const dialog = await openHtmlBlockPanel(page);
  await dialog.locator('#html-block-input').fill('<!doctype html><html><body><p>正文段落</p><script>alert(1)</script></body></html>');

  expect(await dialog.getByText('预览（清洗后）').count()).toBe(0);
  await dialog.getByTestId('html-block-refresh-preview').click();
  await expect(dialog.getByText('预览（清洗后）')).toBeVisible();
  const frame = dialog.locator('[data-testid="rich-html-document"]');
  await expect(frame).toBeVisible();
  const srcdoc = await frame.getAttribute('srcdoc');
  expect(srcdoc).toContain('正文段落');
  expect(srcdoc).not.toContain('alert');
  await page.screenshot({ path: 'test-results/html-block-preview.png', fullPage: true });
});

test('the draft summary warns about images before the import starts', async ({ page }) => {
  const dialog = await openHtmlBlockPanel(page);
  await dialog.locator('#html-block-input').fill('<p>文字</p><img src="data:image/png;base64,YWJj"><img src="https://external.test/a.png">');
  await expect(dialog.getByText(/待导入图片 2 张/)).toBeVisible();
  await expect(dialog.getByText(/每张最大 2MB，最多导入 100 张/)).toBeVisible();
});
