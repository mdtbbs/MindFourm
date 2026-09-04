import { test, expect } from '../fixtures/page-objects/base.po';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';
const MFL_URL = process.env.MFL_URL || 'http://localhost:3000';
const MFL_API_KEY = process.env.MFL_API_KEY || '';

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getMflFileStatus(fileId: number): Promise<{ approval_status: string; approval_resource_id: number | null } | null> {
  try {
    const resp = await fetch(`${MFL_URL}/api/v1/files/${fileId}`, {
      headers: { 'Authorization': `Bearer ${MFL_API_KEY}` },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.data?.file || null;
  } catch {
    return null;
  }
}

async function getResourceById(resourceId: number): Promise<any> {
  const resp = await fetch(`${API_URL}/api/resources/${resourceId}`);
  if (!resp.ok) return null;
  const json = await resp.json();
  return json.data || null;
}

/**
 * Helper: approve/reject a resource via admin API with proper CSRF handling
 */
async function adminUpdateResourceStatus(
  context: import('@playwright/test').BrowserContext,
  resourceId: number,
  status: 'approved' | 'rejected',
): Promise<boolean> {
  // Get admin session
  const adminResp = await context.request.post(`${API_URL}/api/auth/test-login`, {
    data: { userType: 'admin' },
  });
  if (!adminResp.ok()) return false;

  // Get CSRF token from cookies (set by the CSRF middleware on the test-login response)
  const cookies = await context.cookies(API_URL);
  const csrfCookie = cookies.find(c => c.name === 'csrf_token');
  if (!csrfCookie) return false;

  // Update status with CSRF token
  const updateResp = await context.request.put(`${API_URL}/api/resources/${resourceId}/status`, {
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfCookie.value,
    },
    data: { status },
  });

  return updateResp.ok();
}

authTest.describe('MFL Integration - Resource Upload to MindFileList', () => {

  authTest.beforeEach(async () => {
    if (!MFL_API_KEY) {
      authTest.skip(true, 'MFL_API_KEY not configured — skipping MFL integration tests');
    }
  });

  authTest('should submit a resource with MFL upload enabled', async ({ authenticatedPage }) => {
    const title = uniqueName('MFL Resource');

    await authenticatedPage.goto('/resources/submit', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Select upload type
    await authenticatedPage.getByTestId('resource-type-upload').click();

    // Fill form
    await authenticatedPage.getByTestId('resource-title-input').fill(title);
    await authenticatedPage.getByTestId('resource-version-input').fill('1.0.0');
    await authenticatedPage.getByTestId('resource-description-input').fill('MFL integration test resource');
    await authenticatedPage.getByTestId('resource-content-input').fill('This resource is uploaded to MindFileList.');

    // Set file
    await authenticatedPage.getByTestId('resource-file-input').setInputFiles({
      name: 'mfl-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('MFL integration test file content from Playwright'),
    });

    // Wait for MFL checkbox to appear (it appears after file is selected)
    const mflCheckbox = authenticatedPage.getByRole('checkbox').first();
    await authExpect(mflCheckbox).toBeVisible({ timeout: 5000 });
    await mflCheckbox.check();

    // Submit
    await authenticatedPage.getByTestId('resource-submit-button').click();

    // Should redirect to resource detail page
    await authenticatedPage.waitForURL(/\/resources\/\d+$/, { timeout: 30000 });
    await authExpect(authenticatedPage.locator('h1')).toContainText(title);

    // Should show pending banner
    await authExpect(
      authenticatedPage.locator('text=此资源正在等待审核')
    ).toBeVisible({ timeout: 10000 });

    // Download button should be disabled
    await authExpect(
      authenticatedPage.locator('button:has-text("等待审核")')
    ).toBeVisible();
  });

  authTest('should show MFL status on resource detail after upload', async ({ authenticatedPage }) => {
    // First create a resource with MFL
    const title = uniqueName('MFL Status Check');

    await authenticatedPage.goto('/resources/submit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await authenticatedPage.getByTestId('resource-type-upload').click();
    await authenticatedPage.getByTestId('resource-title-input').fill(title);
    await authenticatedPage.getByTestId('resource-file-input').setInputFiles({
      name: 'mfl-status-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('status check content'),
    });

    const mflCheckbox = authenticatedPage.getByRole('checkbox').first();
    await mflCheckbox.check();
    await authenticatedPage.getByTestId('resource-submit-button').click();

    await authenticatedPage.waitForURL(/\/resources\/\d+$/, { timeout: 30000 });

    // Extract resource ID from URL
    const url = authenticatedPage.url();
    const resourceId = parseInt(url.match(/\/resources\/(\d+)/)?.[1] || '0');

    // Verify resource has MFL fields set
    const resource = await getResourceById(resourceId);
    expect(resource).not.toBeNull();
    expect(resource.use_mfl).toBe(true);
    expect(resource.mfl_file_id).not.toBeNull();
    expect(resource.mfl_download_url).toContain('/download/');
    expect(resource.status).toBe('pending');

    // Verify MFL side has the file with pending status
    const mflFile = await getMflFileStatus(resource.mfl_file_id);
    expect(mflFile).not.toBeNull();
    expect(mflFile!.approval_status).toBe('pending');
    expect(mflFile!.approval_resource_id).toBe(resourceId);
  });

  authTest('should block MFL download when resource is pending', async ({ authenticatedPage: page }) => {
    // Create a pending MFL resource
    const title = uniqueName('MFL Block Test');
    await page.goto('/resources/submit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByTestId('resource-type-upload').click();
    await page.getByTestId('resource-title-input').fill(title);
    await page.getByTestId('resource-file-input').setInputFiles({
      name: 'mfl-block-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('block test content'),
    });

    const mflCheckbox = page.getByRole('checkbox').first();
    await mflCheckbox.check();
    await page.getByTestId('resource-submit-button').click();
    await page.waitForURL(/\/resources\/\d+$/, { timeout: 30000 });

    const url = page.url();
    const resourceId = parseInt(url.match(/\/resources\/(\d+)/)?.[1] || '0');
    const resource = await getResourceById(resourceId);

    // Try to download via MF redirect URL
    if (resource?.mfl_download_url) {
      const resp = await fetch(resource.mfl_download_url, { redirect: 'manual' });
      // MFL should return 403 for pending files
      expect(resp.status).toBe(403);
    }
  });

  authTest('admin should approve MFL resource and enable download', async ({ authenticatedPage: page }) => {
    authTest.slow();
    // This test requires admin role - the authenticatedPage uses 'user' by default
    // We'll use page.context().request to call the admin API with proper auth

    // Create a pending MFL resource first (as regular user)
    const title = uniqueName('MFL Approve Test');
    await page.goto('/resources/submit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByTestId('resource-type-upload').click();
    await page.getByTestId('resource-title-input').fill(title);
    await page.getByTestId('resource-file-input').setInputFiles({
      name: 'mfl-approve-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('approve test content'),
    });

    const mflCheckbox = page.getByRole('checkbox').first();
    await mflCheckbox.check();
    await page.getByTestId('resource-submit-button').click();
    await page.waitForURL(/\/resources\/\d+$/, { timeout: 30000 });

    const url = page.url();
    const resourceId = parseInt(url.match(/\/resources\/(\d+)/)?.[1] || '0');
    const resourceBefore = await getResourceById(resourceId);
    const mflFileId = resourceBefore.mfl_file_id;

    // Get admin session and approve
    const adminContext = await page.context().browser()!.newContext();
    const approved = await adminUpdateResourceStatus(adminContext, resourceId, 'approved');
    expect(approved).toBeTruthy();
    await adminContext.close();

    // Verify resource status changed
    const resourceAfter = await getResourceById(resourceId);
    expect(resourceAfter.status).toBe('approved');

    // Verify MFL status synced
    const mflFileAfter = await getMflFileStatus(mflFileId);
    expect(mflFileAfter).not.toBeNull();
    expect(mflFileAfter!.approval_status).toBe('approved');

    // Verify download works now (direct MFL check)
    if (resourceAfter.mfl_download_url) {
      const downloadResp = await fetch(resourceAfter.mfl_download_url, { redirect: 'manual' });
      expect(downloadResp.status).toBe(200);
    }

    // Verify MF API also reports approved
    expect(resourceAfter.status).toBe('approved');
    expect(resourceAfter.use_mfl).toBe(true);
  });

  authTest('admin should reject MFL resource with reason', async ({ authenticatedPage: page }) => {
    // Create a pending MFL resource first (as regular user)
    const title = uniqueName('MFL Reject Test');
    await page.goto('/resources/submit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByTestId('resource-type-upload').click();
    await page.getByTestId('resource-title-input').fill(title);
    await page.getByTestId('resource-file-input').setInputFiles({
      name: 'mfl-reject-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('reject test content'),
    });

    const mflCheckbox = page.getByRole('checkbox').first();
    await mflCheckbox.check();
    await page.getByTestId('resource-submit-button').click();
    await page.waitForURL(/\/resources\/\d+$/, { timeout: 30000 });

    const url = page.url();
    const resourceId = parseInt(url.match(/\/resources\/(\d+)/)?.[1] || '0');
    const resource = await getResourceById(resourceId);
    const mflFileId = resource.mfl_file_id;

    // Get admin session and reject
    const adminContext = await page.context().browser()!.newContext();
    const rejected = await adminUpdateResourceStatus(adminContext, resourceId, 'rejected');
    expect(rejected).toBeTruthy();
    await adminContext.close();

    // Verify MFL status synced to rejected
    const mflFileAfter = await getMflFileStatus(mflFileId);
    expect(mflFileAfter).not.toBeNull();
    expect(mflFileAfter!.approval_status).toBe('rejected');

    // Verify MFL download blocked
    if (resource.mfl_download_url) {
      const downloadResp = await fetch(resource.mfl_download_url, { redirect: 'manual' });
      expect(downloadResp.status).toBe(403);
    }

    // Verify MF API reports rejected
    const resourceAfter = await getResourceById(resourceId);
    expect(resourceAfter.status).toBe('rejected');
  });
});
