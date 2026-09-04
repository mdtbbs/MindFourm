import { test, expect } from '../fixtures/page-objects/base.po';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

function uniqueResourceName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function waitForResourceFormReady(page: import('@playwright/test').Page): Promise<void> {
  // The rich-text editor is client-only.  Waiting for it ensures React has
  // hydrated the form before changing the hidden resource-type radio.
  await page.getByTestId('resource-description-input').waitFor({ state: 'visible' });
}

test.describe('Resource Public Routes', () => {
  test('should redirect legacy upload route to unified submit page', async ({ page }) => {
    await page.goto('/resources/upload', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await expect(page).toHaveURL(/\/resources\/submit$/);
  });
});

authTest.describe('Resource Submission Flow', () => {
  authTest('restores an unfinished resource draft after reload', async ({ authenticatedPage }) => {
    const title = uniqueResourceName('E2E Resource Draft');
    await authenticatedPage.goto('/resources/submit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForResourceFormReady(authenticatedPage);
    await authenticatedPage.getByTestId('resource-type-external').locator('input').check({ force: true });
    await authenticatedPage.getByTestId('resource-title-input').fill(title);
    await authenticatedPage.getByTestId('resource-version-input').fill('draft-1');

    // Draft persistence is debounced so ordinary typing does not synchronously
    // write on every keystroke.
    await authenticatedPage.waitForTimeout(2300);
    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });

    await authExpect(authenticatedPage.getByTestId('resource-title-input')).toHaveValue(title);
    await authExpect(authenticatedPage.getByTestId('resource-version-input')).toHaveValue('draft-1');
    await authExpect(authenticatedPage.getByText('已恢复上次未提交的资源草稿')).toBeVisible();
    await authenticatedPage.getByRole('button', { name: '丢弃草稿' }).click();
  });

  authTest('should submit an external resource', async ({ authenticatedPage }) => {
    const title = uniqueResourceName('E2E External Resource');
    const externalUrl = `https://example.com/resources/${Date.now()}`;

    await authenticatedPage.goto('/resources/submit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForResourceFormReady(authenticatedPage);

    await authenticatedPage.getByTestId('resource-type-external').locator('input').check({ force: true });
    await authenticatedPage.getByTestId('resource-title-input').fill(title);
    await authenticatedPage.getByTestId('resource-version-input').fill('1.0.0');
    await authenticatedPage.getByTestId('resource-description-input').fill('External resource submitted by Playwright.');
    await authenticatedPage.getByTestId('resource-content-input').fill('Resource detail body from Playwright.');
    await authenticatedPage.getByTestId('resource-external-url-input').fill(externalUrl);

    await authenticatedPage.getByTestId('resource-submit-button').click();

    await authenticatedPage.waitForURL(/\/resources\/\d+$/, { timeout: 30000 });
    await authExpect(authenticatedPage.locator('h1')).toContainText(title);
    await authExpect(authenticatedPage.locator(`a[href="${externalUrl}"]`)).toBeVisible();
  });

  authTest('should submit an uploaded resource', async ({ authenticatedPage }) => {
    const title = uniqueResourceName('E2E Uploaded Resource');

    await authenticatedPage.goto('/resources/submit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForResourceFormReady(authenticatedPage);

    await authenticatedPage.getByTestId('resource-type-upload').locator('input').check({ force: true });
    await authenticatedPage.getByTestId('resource-title-input').fill(title);
    await authenticatedPage.getByTestId('resource-version-input').fill('2.0.0');
    await authenticatedPage.getByTestId('resource-description-input').fill('Uploaded resource submitted by Playwright.');
    await authenticatedPage.getByTestId('resource-content-input').fill('Uploaded resource detail body from Playwright.');
    await authenticatedPage.getByTestId('resource-file-input').setInputFiles({
      name: 'playwright-resource.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('resource upload fixture created by Playwright'),
    });

    await authenticatedPage.getByTestId('resource-submit-button').click();

    await authenticatedPage.waitForURL(/\/resources\/\d+$/, { timeout: 30000 });
    await authExpect(authenticatedPage.locator('h1')).toContainText(title);
    const downloadLink = authenticatedPage.locator('a[href*="/api/resources/"][href*="/download"]');
    await authExpect(downloadLink).toBeVisible();

    const [download] = await Promise.all([
      authenticatedPage.waitForEvent('download'),
      downloadLink.click(),
    ]);
    expect(download.suggestedFilename()).toBe('playwright-resource.txt');
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();

    let downloadedContent = '';
    for await (const chunk of stream!) {
      downloadedContent += chunk.toString();
    }
    expect(downloadedContent).toBe('resource upload fixture created by Playwright');
  });
});
