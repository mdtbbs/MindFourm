import { test, expect } from '../fixtures/page-objects/base.po';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';
import { API_URL, approveAsAdmin, testLogin } from '../helpers/content.helpers';

function uniqueResourceName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function unwrap(value: any): any {
  return value?.data?.data ?? value?.data ?? value;
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
    await authenticatedPage.getByTestId('resource-type-external').click();
    await authExpect(authenticatedPage.getByTestId('resource-type-external').locator('input')).toBeChecked();
    await authenticatedPage.getByTestId('resource-title-input').fill(title);
    await authenticatedPage.getByTestId('resource-version-input').fill('draft-1');

    // Draft persistence is debounced so ordinary typing does not synchronously
    // write on every keystroke.
    await authenticatedPage.waitForTimeout(2300);
    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });

    await authExpect(authenticatedPage.getByText(/发现此设备保存的草稿/)).toBeVisible();
    await authenticatedPage.getByRole('button', { name: '恢复草稿' }).click();
    await authExpect(authenticatedPage.getByTestId('resource-title-input')).toHaveValue(title);
    await authExpect(authenticatedPage.getByTestId('resource-version-input')).toHaveValue('draft-1');
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

  authTest('resource discussion rich replies round-trip through the canonical forum thread', async ({ authenticatedPage, request }) => {
    const stamp = Date.now();
    const title = `E2E Resource rich discussion ${stamp}`;
    const user = await testLogin(request, 'user');
    const admin = await testLogin(request, 'admin');
    const userHeaders = { Cookie: user.cookieHeader, 'X-CSRF-Token': user.csrfToken };
    const adminHeaders = { Cookie: admin.cookieHeader, 'X-CSRF-Token': admin.csrfToken };

    const createResource = await request.post(`${API_URL}/api/resources`, {
      multipart: {
        title,
        resource_type: 'external',
        resource_kind: 'mod',
        version: '1.0.0',
        is_public: '1',
        external_url: `https://example.com/e2e/resource-discussion/${stamp}`,
        content: 'Canonical discussion acceptance fixture.',
      },
      headers: { ...userHeaders, 'Idempotency-Key': `e2e-resource-discussion-${stamp}` },
    });
    if (!createResource.ok()) throw new Error(`Resource discussion fixture failed: ${createResource.status()} ${await createResource.text()}`);
    const created = unwrap(await createResource.json());
    const resourceId = Number(created?.id ?? created?.resource?.id);
    if (!Number.isSafeInteger(resourceId) || resourceId < 1) throw new Error('Resource creation response carried no id');

    const approveResource = await request.put(`${API_URL}/api/resources/${resourceId}/status`, {
      data: { status: 'approved' }, headers: adminHeaders,
    });
    if (!approveResource.ok()) throw new Error(`Resource approval failed: ${approveResource.status()} ${await approveResource.text()}`);

    const hostText = `E2E resource discussion quote host ${stamp}`;
    const createHost = await request.post(`${API_URL}/api/resources/${resourceId}/comments`, {
      data: { content: hostText }, headers: userHeaders,
    });
    if (!createHost.ok()) throw new Error(`Resource discussion host reply failed: ${createHost.status()} ${await createHost.text()}`);
    const host = unwrap(await createHost.json());
    const hostReplyId = Number(host?.id ?? host?.reply?.id);
    if (!Number.isSafeInteger(hostReplyId) || hostReplyId < 1) throw new Error('Host reply response carried no id');
    await approveAsAdmin(request, 'reply', hostReplyId);

    const initialResponse = await request.get(`${API_URL}/api/resources/${resourceId}/comments?limit=100`);
    const initialEnvelope = await initialResponse.json();
    const initialProjection = initialEnvelope?.data?.data ? initialEnvelope.data : initialEnvelope?.data ?? initialEnvelope;
    const threadId = Number(initialProjection?.discussion_thread_id);
    if (!Number.isSafeInteger(threadId) || threadId < 1) throw new Error('Resource discussion response carried no canonical thread id');

    await authenticatedPage.goto(`/resources/${resourceId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await authenticatedPage.getByRole('tab', { name: /评论|Comments/ }).click();
    const hostCard = authenticatedPage.locator('div.card').filter({ hasText: hostText }).last();
    await authExpect(hostCard).toBeVisible();
    await hostCard.getByRole('button', { name: /引用|Quote/i }).click();

    const editor = authenticatedPage.getByTestId('reply-input');
    await authExpect(editor.locator('aside[data-quote-type="reply"]')).toHaveAttribute('data-reply-id', String(hostReplyId));
    await editor.press('End');
    await editor.pressSequentially(`Quoted on the resource page @e2e`);
    const mentionOption = authenticatedPage.getByRole('option', { name: /@e2e_admin/ });
    await authExpect(mentionOption).toBeVisible();
    await mentionOption.click();
    await authExpect(editor.locator(`[data-mention-user-id="${admin.userId ?? 1}"]`)).toBeVisible();

    const resourceReplyText = `E2E resource rich reply ${stamp}`;
    await editor.press('End');
    await editor.pressSequentially(` ${resourceReplyText}`);
    const resourceReplyResponse = authenticatedPage.waitForResponse((response) =>
      response.url().includes(`/api/resources/${resourceId}/comments`) && response.request().method() === 'POST');
    await authenticatedPage.getByTestId('submit-reply').click();
    const resourceReplyBody = unwrap(await (await resourceReplyResponse).json());
    const resourceReplyId = Number(resourceReplyBody?.id ?? resourceReplyBody?.reply?.id);
    if (!Number.isSafeInteger(resourceReplyId) || resourceReplyId < 1) throw new Error('Rich resource reply response carried no id');
    await approveAsAdmin(request, 'reply', resourceReplyId);

    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });
    await authenticatedPage.getByRole('tab', { name: /评论|Comments/ }).click();
    await authExpect(authenticatedPage.getByText(resourceReplyText, { exact: false })).toBeVisible();
    await authExpect(authenticatedPage.getByText('查看完整讨论', { exact: true })).toBeVisible();
    await authenticatedPage.getByRole('link', { name: /查看完整讨论|Full discussion/i }).click();
    await authExpect(authenticatedPage).toHaveURL(new RegExp(`/posts/${threadId}$`));
    await authExpect(authenticatedPage.getByText(resourceReplyText, { exact: false })).toBeVisible();

    const threadReplyText = `E2E full discussion reply ${stamp}`;
    const threadEditor = authenticatedPage.getByTestId('reply-input');
    await threadEditor.fill(threadReplyText);
    const threadReplyResponse = authenticatedPage.waitForResponse((response) =>
      response.url().includes(`/api/posts/${threadId}/replies`) && response.request().method() === 'POST');
    await authenticatedPage.getByTestId('submit-reply').click();
    const threadReplyBody = unwrap(await (await threadReplyResponse).json());
    const threadReplyId = Number(threadReplyBody?.id ?? threadReplyBody?.reply?.id);
    if (!Number.isSafeInteger(threadReplyId) || threadReplyId < 1) throw new Error('Full discussion reply response carried no id');
    await approveAsAdmin(request, 'reply', threadReplyId);

    const compactAfterForumWrite = unwrap(await (await request.get(`${API_URL}/api/resources/${resourceId}/comments?limit=100`)).json());
    const forumAfterForumWrite = unwrap(await (await request.get(`${API_URL}/api/posts/${threadId}/replies?limit=100`)).json());
    const compactRows = Array.isArray(compactAfterForumWrite) ? compactAfterForumWrite : compactAfterForumWrite?.data || [];
    const forumRows = Array.isArray(forumAfterForumWrite) ? forumAfterForumWrite : forumAfterForumWrite?.data || [];
    expect(compactRows.filter((row: any) => row.id === resourceReplyId)).toHaveLength(1);
    expect(compactRows.filter((row: any) => row.id === threadReplyId)).toHaveLength(1);
    expect(forumRows.filter((row: any) => row.id === resourceReplyId)).toHaveLength(1);
    expect(forumRows.filter((row: any) => row.id === threadReplyId)).toHaveLength(1);

    await authenticatedPage.goto(`/resources/${resourceId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await authenticatedPage.getByRole('tab', { name: /评论|Comments/ }).click();
    await authExpect(authenticatedPage.getByText(threadReplyText, { exact: false })).toBeVisible();
  });

  authTest('should submit an uploaded resource', async ({ authenticatedPage }) => {
    const title = uniqueResourceName('E2E Uploaded Resource');

    await authenticatedPage.goto('/resources/submit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForResourceFormReady(authenticatedPage);

    await authenticatedPage.getByTestId('resource-type-upload').click();
    await authExpect(authenticatedPage.getByTestId('resource-type-upload').locator('input')).toBeChecked();
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
