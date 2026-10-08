import { test as authTest, expect } from '../fixtures/auth.fixture';
import type { Page } from '@playwright/test';
import { TEST_USERS } from '../fixtures/test-users';
import {
  API_URL,
  approveAsAdmin,
  createPublishedPost,
  createPublishedReply,
  testLogin,
} from '../helpers/content.helpers';

function unwrap(value: any): any {
  return value?.data?.data ?? value?.data ?? value;
}

function writeHeaders(session: Awaited<ReturnType<typeof testLogin>>) {
  return { Cookie: session.cookieHeader, 'X-CSRF-Token': session.csrfToken };
}

function visiblePostContent(page: Page) {
  return page.locator('[data-testid="post-content"]:visible').first();
}

async function createRichPost(request: Parameters<typeof testLogin>[0], title: string, document: Record<string, unknown>) {
  const session = await testLogin(request, 'user');
  const waits = [7000, 20000, 65000];
  let response = await request.post(`${API_URL}/api/posts`, {
    data: { title, content_schema_version: 2, content_json: document },
    headers: writeHeaders(session),
  });
  for (const waitMs of waits) {
    if (response.status() !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await request.post(`${API_URL}/api/posts`, {
      data: { title, content_schema_version: 2, content_json: document },
      headers: writeHeaders(session),
    });
  }
  if (!response.ok()) throw new Error(`Rich post creation failed: ${response.status()} ${await response.text()}`);
  const responseBody = unwrap(await response.json());
  const id = Number(responseBody?.id ?? responseBody?.post?.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Rich post response carried no id');
  await approveAsAdmin(request, 'post', id);
  return id;
}

async function createRichReply(request: Parameters<typeof testLogin>[0], postId: number, document: Record<string, unknown>) {
  const session = await testLogin(request, 'user');
  const response = await request.post(`${API_URL}/api/posts/${postId}/replies`, {
    data: { content_schema_version: 2, content_json: document },
    headers: writeHeaders(session),
  });
  if (!response.ok()) throw new Error(`Rich reply creation failed: ${response.status()} ${await response.text()}`);
  const body = unwrap(await response.json());
  const id = Number(body?.id ?? body?.reply?.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Rich reply response carried no id');
  await approveAsAdmin(request, 'reply', id);
  return id;
}

authTest.describe('Rich Content Schema v2 E2E', () => {
  let hostPostId: number;
  let hostReplyId: number;
  let richPostId: number;
  let richReplyId: number;
  let draftAttachmentId: number;

  authTest.beforeAll(async ({ request }) => {
    const host = await createPublishedPost(request, {
      author: 'admin',
      title: `Rich content quote host ${Date.now()}`,
      content: '# Legacy Markdown fallback\n\nThis post uses the old Markdown-only write path.',
    });
    hostPostId = host.id;
    hostReplyId = await createPublishedReply(request, {
      author: 'admin',
      postId: host.id,
      content: 'Reply available for a live quote card.',
    });

    const userSession = await testLogin(request, 'user');
    const upload = await request.post(`${API_URL}/api/attachments/drafts`, {
      multipart: { files: { name: 'rich-draft.txt', mimeType: 'text/plain', buffer: Buffer.from('draft attachment') } },
      headers: writeHeaders(userSession),
    });
    if (!upload.ok()) throw new Error(`Attachment draft upload failed: ${upload.status()} ${await upload.text()}`);
    const draftBody = unwrap(await upload.json());
    const draft = draftBody?.drafts?.[0];
    if (!draft?.token || !Number.isSafeInteger(Number(draft.id))) throw new Error('Attachment draft response carried no token or id');
    draftAttachmentId = Number(draft.id);

    const paragraph = (text: string, marks?: Record<string, unknown>[]) => ({
      type: 'paragraph',
      content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
    });
    const document = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Schema v2 E2E heading' }] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'bold rich content', marks: [{ type: 'bold' }, { type: 'textColor', attrs: { color: '#336699' } }, { type: 'fontSize', attrs: { size: '18px' } }] },
          { type: 'text', text: ' 🌻' },
          { type: 'mention', attrs: { userId: TEST_USERS.admin.id, username: 'snapshot-will-be-canonicalized' } },
        ] },
        { type: 'bulletList', attrs: { tight: true }, content: [{ type: 'listItem', content: [paragraph('tight bullet')] }] },
        { type: 'orderedList', attrs: { start: 1, tight: true }, content: [{ type: 'listItem', content: [paragraph('ordered item')] }] },
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: false }, content: [paragraph('read-only task')] },
          { type: 'taskItem', attrs: { checked: true }, content: [paragraph('completed task')] },
        ] },
        { type: 'blockquote', content: [paragraph('quoted paragraph')] },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const schemaVersion = 2;' }] },
        { type: 'paragraph', content: [{ type: 'image', attrs: { src: '/favicon.ico', alt: 'schema fixture', title: null, width: null, height: null } }] },
        { type: 'table', content: [{ type: 'tableRow', content: [
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [paragraph('header')] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [paragraph('block cell')] },
        ] }] },
        { type: 'spoiler', attrs: { title: 'E2E spoiler', open: false }, content: [paragraph('hidden spoiler body')] },
        { type: 'video', attrs: { provider: 'bilibili', videoId: 'BV1xx411c7mD', src: null, title: 'E2E Bilibili video' } },
        { type: 'attachment', attrs: { attachmentId: null, draftToken: draft.token } },
        { type: 'postQuote', attrs: { postId: host.id } },
        { type: 'replyQuote', attrs: { postId: host.id, replyId: hostReplyId } },
      ],
    };
    richPostId = await createRichPost(request, `Rich content v2 ${Date.now()}`, document);
    richReplyId = await createRichReply(request, richPostId, {
      type: 'doc',
      content: [paragraph('Rich reply before edit'), { type: 'spoiler', attrs: { title: 'Reply spoiler', open: false }, content: [paragraph('Reply body stays structured')] }],
    });
  });

  authTest('1. publishes and renders a JSON-authored post', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${richPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const post = visiblePostContent(authenticatedPage);
    await expect(post).toBeVisible();
    await expect(post.getByTestId('rich-content-renderer')).toBeVisible();
    await expect(post.getByRole('heading', { name: 'Schema v2 E2E heading' })).toBeVisible();
  });

  authTest('2. renders nested bullet and ordered lists from JSON', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${richPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const post = visiblePostContent(authenticatedPage);
    await expect(post.getByText('tight bullet', { exact: true })).toBeVisible();
    await expect(post.getByText('ordered item', { exact: true })).toBeVisible();
  });

  authTest('3. task-list checkboxes are visible and read-only', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${richPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const checkboxes = visiblePostContent(authenticatedPage).getByTestId('rich-task-checkbox');
    await expect(checkboxes).toHaveCount(2);
    await expect(checkboxes.nth(0)).toBeDisabled();
    await expect(checkboxes.nth(1)).toBeDisabled();
    await expect(checkboxes.nth(1)).toBeChecked();
  });

  authTest('4. mention renders as a user link with the canonical username', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${richPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const mention = visiblePostContent(authenticatedPage).getByTestId('rich-mention');
    await expect(mention).toHaveAttribute('href', `/users/${TEST_USERS.admin.id}`);
    await expect(mention).toContainText(`@${TEST_USERS.admin.username}`);
  });

  authTest('5. Unicode emoji remains inline text', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${richPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await expect(visiblePostContent(authenticatedPage).getByTestId('rich-content-renderer')).toContainText('🌻');
  });

  authTest('6. spoiler is collapsed until the reader opens it', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${richPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const spoiler = visiblePostContent(authenticatedPage).getByTestId('rich-spoiler');
    await expect(spoiler).toHaveJSProperty('open', false);
    await spoiler.locator('summary').click();
    await expect(spoiler).toHaveJSProperty('open', true);
    await expect(spoiler.getByText('hidden spoiler body')).toBeVisible();
  });

  authTest('7. post and reply quotes recheck visibility and link to current content', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${richPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const post = visiblePostContent(authenticatedPage);
    const cards = post.getByTestId('rich-quote-card');
    await expect(cards).toHaveCount(2);
    await expect(post.getByRole('link', { name: '打开引用帖子' })).toHaveAttribute('href', `/posts/${hostPostId}`);
    await expect(post.getByRole('link', { name: '查看引用回复' })).toHaveAttribute('href', `/posts/${hostPostId}#reply-${hostReplyId}`);
  });

  authTest('8. external video player loads only after a reader activates it', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${richPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const post = visiblePostContent(authenticatedPage);
    await expect(post.getByTestId('rich-video-frame')).toHaveCount(0);
    await post.getByTestId('rich-video-activate').click();
    await expect(post.getByTestId('rich-video-frame')).toHaveAttribute('src', /player\.bilibili\.com/);
  });

  authTest('9. attachment draft is bound to the post and the token is removed', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/posts/${richPostId}`);
    expect(response.ok()).toBeTruthy();
    const body = unwrap(await response.json());
    const post = body?.post ?? body;
    const visit = (node: any): any[] => node?.type === 'attachment'
      ? [node]
      : (node?.content || []).flatMap(visit);
    const attachments = visit(post.content_json);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].attrs.attachmentId).toBe(draftAttachmentId);
    expect(attachments[0].attrs).not.toHaveProperty('draftToken');
  });

  authTest('10. post edit form reopens the same structured JSON', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${richPostId}/edit`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const editor = authenticatedPage.getByTestId('post-content-editor');
    await expect(editor.locator('h2')).toHaveText('Schema v2 E2E heading');
    await expect(editor.locator('details[data-type="spoiler"] summary')).toHaveText('E2E spoiler');
  });

  authTest('11. rich reply displays its structured spoiler', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${richPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const reply = authenticatedPage.locator(`#reply-${richReplyId}`);
    await expect(reply).toBeVisible();
    await expect(reply.getByTestId('rich-spoiler').locator('summary')).toHaveText('Reply spoiler');
  });

  authTest('12. reply edit keeps the JSON structure while saving a change', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${richPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await authenticatedPage.getByTestId(`reply-edit-${richReplyId}`).click();
    const editor = authenticatedPage.getByTestId(`reply-edit-input-${richReplyId}`);
    await expect(editor.locator('details[data-type="spoiler"] summary')).toHaveText('Reply spoiler');
    await editor.press('End');
    await editor.pressSequentially(' updated');
    await authenticatedPage.getByTestId(`reply-edit-save-${richReplyId}`).click();
    const savedSpoiler = authenticatedPage.locator(`#reply-${richReplyId}`).getByTestId('rich-spoiler');
    await savedSpoiler.locator('summary').click();
    await expect(savedSpoiler.locator('summary')).toHaveText('Reply spoiler');
    await expect(authenticatedPage.locator(`#reply-${richReplyId}`)).toContainText('Reply body stays structured');
    await expect(authenticatedPage.locator(`#reply-${richReplyId}`)).toContainText('updated');
  });

  authTest('13. mobile editor moves its toolbar to the visual viewport bottom', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 390, height: 844 });
    await authenticatedPage.goto('/posts/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const editor = authenticatedPage.getByTestId('post-content-editor');
    await expect(editor).toBeVisible();
    await editor.focus();
    const toolbar = authenticatedPage.getByRole('toolbar', { name: '编辑器工具栏' });
    await expect(toolbar).toBeVisible();
    expect(await toolbar.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  });

  authTest('14. legacy Markdown-only post remains readable through fallback', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${hostPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const post = visiblePostContent(authenticatedPage);
    await expect(post).toContainText('Legacy Markdown fallback');
    await expect(post).toContainText('This post uses the old Markdown-only write path.');
  });

  authTest('15. quoting a reply inserts an ID-only quote node into the composer', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/posts/${hostPostId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const hostReply = authenticatedPage.locator(`#reply-${hostReplyId}`);
    await hostReply.getByRole('button', { name: /引用|Quote/i }).click();
    await expect(authenticatedPage.getByTestId('reply-input').locator('aside[data-quote-type="reply"]')).toHaveAttribute('data-reply-id', String(hostReplyId));
    await expect(authenticatedPage.getByTestId('reply-input').locator('aside[data-quote-type="reply"]')).toHaveAttribute('data-post-id', String(hostPostId));
  });
});


// This case uses the real API and authentication fixtures. The independent
// presentation fixture suite is not a substitute for this publication check.
authTest('Presentation contract: preview and real published post share styles', async ({ authenticatedPage: page, request }) => {
  const fixture = (await import('../fixtures/rich-presentation.json')).default;
  const document = { ...fixture, content: fixture.content.filter((node) => !['attachment', 'postQuote', 'replyQuote'].includes(node.type)).map((node) => node.type === 'paragraph' ? { ...node, content: node.content?.filter((child: any) => child.type !== 'customEmoji') } : node) };
  await page.evaluate((json) => localStorage.setItem('draft:post:new', JSON.stringify({ timestamp: Date.now(), values: { title: `E2E Presentation ${Date.now()}`, content: 'Presentation projection', contentJson: json, status: 'published' } })), document);
  await page.goto('/posts/new');
  await page.getByRole('button', { name: /恢复草稿/ }).click();
  await expect(page.getByTestId('post-content-editor').locator('h1')).toBeVisible();
  await page.getByTestId('post-preview-tab').click();
  const preview = page.getByTestId('post-preview').getByTestId('rich-content-renderer');
  // Capture common nodes present in this real-API fixture; ID-sensitive cards
  // are covered by the existing permission/binding tests above.
  const snapshot = async (root: ReturnType<typeof page.locator>) => root.locator('p,h1,h2,h3,blockquote,ul,ol,li,code,pre,table,th,td,img:not(.rich-custom-emoji):not(.ProseMirror-separator)').evaluateAll((nodes) => nodes.map((element) => {
    const style = getComputedStyle(element);
    return ['fontSize','lineHeight','fontWeight','marginTop','marginBottom','paddingLeft','paddingRight','backgroundColor','borderLeftWidth','borderTopWidth','listStyleType'].map((key) => style[key as keyof CSSStyleDeclaration]);
  }));
  const styles = await snapshot(preview);
  const response = page.waitForResponse((res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/posts');
  await page.getByTestId('publish-button').click();
  const created = await response;
  expect(created.ok()).toBeTruthy();
  const post = unwrap(await created.json());
  const id = Number(post?.id ?? post?.post?.id);
  await approveAsAdmin(request, 'post', id);
  await page.goto(`/posts/${id}`);
  const published = visiblePostContent(page).getByTestId('rich-content-renderer');
  await expect(published).toBeVisible();
  expect(await snapshot(published)).toEqual(styles);
});
