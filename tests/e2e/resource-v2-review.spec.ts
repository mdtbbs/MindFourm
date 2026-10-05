import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { API_URL, testLogin, type SessionCookies } from '../helpers/content.helpers';

function unwrap(value: any): any {
  let current = value;
  for (let depth = 0; depth < 4 && current && typeof current === 'object' && 'data' in current; depth += 1) {
    current = current.data;
  }
  return current;
}

function headers(session: SessionCookies): Record<string, string> {
  return { Cookie: session.cookieHeader, 'X-CSRF-Token': session.csrfToken };
}

async function expectOk(response: Awaited<ReturnType<APIRequestContext['get']>>, label: string): Promise<any> {
  if (!response.ok()) throw new Error(`${label}: ${response.status()} ${await response.text()}`);
  return unwrap(await response.json());
}

async function createUploadedResource(
  request: APIRequestContext,
  session: SessionCookies,
  title: string,
  bytes: Buffer,
): Promise<{ id: number; publicId: string }> {
  const response = await request.post(`${API_URL}/api/resources`, {
    multipart: {
      title,
      resource_type: 'upload',
      resource_kind: 'other',
      version: '1.0.0',
      is_public: '1',
      description: 'Resource Center V2 moderation smoke fixture.',
      content: 'Version review fixture.',
      file: { name: 'fixture.txt', mimeType: 'text/plain', buffer: bytes },
    },
    headers: { ...headers(session), 'Idempotency-Key': `e2e-resource-v2-${Date.now()}-${Math.random()}` },
  });
  const created = await expectOk(response, 'Create uploaded resource');
  const id = Number(created?.id ?? created?.resource?.id);
  let publicId = String(created?.public_id ?? created?.resource?.public_id ?? '');
  if (!publicId && Number.isSafeInteger(id) && id > 0) {
    const detail = await expectOk(await request.get(`${API_URL}/api/resources/${id}`, { headers: headers(session) }), 'Read resource detail');
    publicId = String(detail?.public_id || '');
  }
  if (!Number.isSafeInteger(id) || id < 1 || !/^[0-9a-f-]{36}$/i.test(publicId)) {
    throw new Error('Resource fixture response did not include public and internal resource identifiers.');
  }
  return { id, publicId };
}

async function createExternalResource(
  request: APIRequestContext,
  session: SessionCookies,
  title: string,
): Promise<{ id: number; publicId: string }> {
  const response = await request.post(`${API_URL}/api/resources`, {
    multipart: {
      title,
      resource_type: 'external',
      resource_kind: 'other',
      version: '1.0.0',
      is_public: '1',
      external_url: `https://example.com/resource-v2-transfer/${Date.now()}`,
      description: 'Ownership transfer smoke fixture.',
      content: 'Owner transfer fixture.',
    },
    headers: { ...headers(session), 'Idempotency-Key': `e2e-resource-v2-${Date.now()}-${Math.random()}` },
  });
  const created = await expectOk(response, 'Create ownership transfer resource');
  const id = Number(created?.id ?? created?.resource?.id);
  let publicId = String(created?.public_id ?? created?.resource?.public_id ?? '');
  if (!publicId && Number.isSafeInteger(id) && id > 0) {
    const detail = await expectOk(await request.get(`${API_URL}/api/resources/${id}`, { headers: headers(session) }), 'Read transfer resource');
    publicId = String(detail?.public_id || '');
  }
  if (!Number.isSafeInteger(id) || id < 1 || !/^[0-9a-f-]{36}$/i.test(publicId)) {
    throw new Error('Transfer fixture response did not include public and internal resource identifiers.');
  }
  return { id, publicId };
}

async function approveResource(request: APIRequestContext, id: number, admin: SessionCookies): Promise<void> {
  const response = await request.put(`${API_URL}/api/resources/${id}/status`, {
    data: { status: 'approved' },
    headers: headers(admin),
  });
  if (!response.ok()) throw new Error(`Approve Resource ${id}: ${response.status()} ${await response.text()}`);
}

async function approveVersion(
  request: APIRequestContext,
  resourcePublicId: string,
  versionPublicId: string,
  moderator: SessionCookies,
): Promise<any> {
  const response = await request.post(
    `${API_URL}/api/v1/resources/${resourcePublicId}/versions/${versionPublicId}/review`,
    { data: { action: 'approve' }, headers: headers(moderator) },
  );
  return expectOk(response, `Approve version ${versionPublicId}`);
}

async function uploadVersion(
  request: APIRequestContext,
  resourcePublicId: string,
  session: SessionCookies,
  version: string,
  payload: string,
) {
  const response = await request.post(`${API_URL}/api/v1/resources/${resourcePublicId}/versions`, {
    multipart: {
      version,
      version_mode: 'semver',
      release_channel: 'release',
      file: { name: `${version}.txt`, mimeType: 'text/plain', buffer: Buffer.from(payload) },
    },
    headers: headers(session),
  });
  return { response, payload: response.ok() ? unwrap(await response.json()) : null };
}

async function startTransfer(
  request: APIRequestContext,
  publicId: string,
  username: string,
  owner: SessionCookies,
): Promise<void> {
  const response = await request.post(`${API_URL}/api/v1/resources/${publicId}/owner-transfer`, {
    data: { username },
    headers: headers(owner),
  });
  if (!response.ok()) throw new Error(`Start transfer to ${username}: ${response.status()} ${await response.text()}`);
}

async function respondToTransfer(
  request: APIRequestContext,
  publicId: string,
  accept: unknown,
  invitee: SessionCookies,
): Promise<any> {
  return request.post(`${API_URL}/api/v1/resources/${publicId}/members/respond`, {
    data: { accept },
    headers: headers(invitee),
  });
}

test('Resource Center V2 keeps binaries private until version review and serializes transfer and revision writes', async ({ request }) => {
  const owner = await testLogin(request, 'user');
  const moderator = await testLogin(request, 'moderator');
  const admin = await testLogin(request, 'admin');
  const stamp = Date.now();
  const initialPayload = `published version one ${stamp}`;
  const resource = await createUploadedResource(request, owner, `E2E Resource V2 review ${stamp}`, Buffer.from(initialPayload));

  const reviewerWorkbench = unwrap(await (await request.get(
    `${API_URL}/api/v1/resources/${resource.publicId}/workbench`,
    { headers: headers(moderator) },
  )).json());
  expect(reviewerWorkbench.versions.map((version: any) => version.status)).toContain('pending_review');
  expect(reviewerWorkbench.permissions).toMatchObject({ role: 'moderator', can_manage: false });

  await approveResource(request, resource.id, admin);
  const workbench = unwrap(await (await request.get(
    `${API_URL}/api/v1/resources/${resource.publicId}/workbench`,
    { headers: headers(owner) },
  )).json());
  const initial = workbench.versions.find((version: any) => version.version === '1.0.0');
  expect(initial?.status).toBe('pending_review');
  expect(JSON.stringify(initial)).not.toMatch(/"(?:id|resource_id|resource_version_id)"\s*:/);
  const ownerLegacyDetail = unwrap(await (await request.get(
    `${API_URL}/api/resources/${resource.id}`,
    { headers: headers(owner) },
  )).json());
  const initialLegacy = ownerLegacyDetail.versions.find((version: any) => version.public_id === initial.public_id);
  expect(Number.isSafeInteger(Number(initialLegacy?.id))).toBe(true);

  const anonymous = await playwrightRequest.newContext();
  try {
    const beforeReview = unwrap(await (await anonymous.get(
      `${API_URL}/api/v1/resources/${resource.publicId}/versions`,
    )).json());
    expect(beforeReview.items).toEqual([]);
    const legacyVersions = await anonymous.get(`${API_URL}/api/resources/${resource.id}/versions`);
    expect(legacyVersions.ok()).toBeTruthy();
    expect(unwrap(await legacyVersions.json())).toEqual([]);
    const pendingLegacyDownload = await anonymous.get(
      `${API_URL}/api/resources/${resource.id}/download?version_id=${initialLegacy.id}`,
    );
    expect(pendingLegacyDownload.status()).toBe(404);
  } finally {
    await anonymous.dispose();
  }

  await approveVersion(request, resource.publicId, initial.public_id, moderator);
  const v1Public = unwrap(await (await request.get(
    `${API_URL}/api/v1/resources/${resource.publicId}/versions`,
  )).json());
  const v1 = v1Public.items.find((version: any) => version.public_id === initial.public_id);
  expect(v1?.status).toBe('published');
  const downloadUrl = v1?.files?.find((file: any) => file.role === 'primary')?.download_url;
  expect(typeof downloadUrl).toBe('string');
  const v1Download = await request.get(new URL(downloadUrl, API_URL).toString());
  if (!v1Download.ok()) throw new Error(`Published v1 download failed: ${v1Download.status()} ${await v1Download.text()}`);
  expect(await v1Download.text()).toBe(initialPayload);

  const pendingVersionTwo = `pending version two ${stamp}`;
  const uploaded = await uploadVersion(request, resource.publicId, owner, '2.0.0', pendingVersionTwo);
  expect(uploaded.response.status()).toBe(201);
  expect(uploaded.payload.version).toMatchObject({ status: 'pending_review', published_at: null, recommended: false });
  const anonymousAfterUpload = await playwrightRequest.newContext();
  try {
    const stillPublishedDownload = await anonymousAfterUpload.get(new URL(downloadUrl, API_URL).toString());
    expect(stillPublishedDownload.ok()).toBeTruthy();
    expect(await stillPublishedDownload.text()).toBe(initialPayload);
    const stillPublicResource = unwrap(await (await anonymousAfterUpload.get(`${API_URL}/api/resources/${resource.id}`)).json());
    expect(stillPublicResource.status).toBe('approved');
    expect(stillPublicResource.versions.map((version: any) => version.public_id)).not.toContain(uploaded.payload.version.public_id);
  } finally {
    await anonymousAfterUpload.dispose();
  }

  const [revisionA, revisionB] = await Promise.all([
    uploadVersion(request, resource.publicId, owner, '1.5.0', `revision race A ${stamp}`),
    uploadVersion(request, resource.publicId, owner, '1.5.0', `revision race B ${stamp}`),
  ]);
  expect(revisionA.response.status()).toBe(201);
  expect(revisionB.response.status()).toBe(201);
  expect([revisionA.payload.version.revision, revisionB.payload.version.revision].sort()).toEqual([1, 2]);
  expect(revisionA.payload.version.status).toBe('pending_review');
  expect(revisionB.payload.version.status).toBe('pending_review');

  const privateWorkbench = unwrap(await (await request.get(
    `${API_URL}/api/v1/resources/${resource.publicId}/workbench`,
    { headers: headers(owner) },
  )).json());
  expect(privateWorkbench.versions.map((version: any) => version.public_id)).toEqual(expect.arrayContaining([
    uploaded.payload.version.public_id,
    revisionA.payload.version.public_id,
    revisionB.payload.version.public_id,
  ]));
  const moderatorWorkbench = unwrap(await (await request.get(
    `${API_URL}/api/v1/resources/${resource.publicId}/workbench`,
    { headers: headers(moderator) },
  )).json());
  expect(moderatorWorkbench.versions.map((version: any) => version.public_id)).toContain(uploaded.payload.version.public_id);

  const publicBeforeApprove = unwrap(await (await request.get(
    `${API_URL}/api/v1/resources/${resource.publicId}/versions`,
  )).json());
  expect(publicBeforeApprove.items.map((version: any) => version.public_id)).toEqual([initial.public_id]);
  const hiddenV2File = privateWorkbench.versions.find((version: any) => version.public_id === uploaded.payload.version.public_id)
    ?.files?.find((file: any) => file.role === 'primary');
  expect(hiddenV2File?.public_id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(typeof hiddenV2File?.download_url).toBe('string');
  const ownerPendingDownload = await request.get(new URL(hiddenV2File.download_url, API_URL).toString(), { headers: headers(owner) });
  expect(ownerPendingDownload.ok()).toBeTruthy();
  expect(await ownerPendingDownload.text()).toBe(pendingVersionTwo);
  const anonymousAfterUploadV2 = await playwrightRequest.newContext();
  try {
    const denied = await anonymousAfterUploadV2.get(new URL(hiddenV2File.download_url, API_URL).toString());
    expect(denied.status()).toBe(404);
  } finally {
    await anonymousAfterUploadV2.dispose();
  }

  const approvedV2 = await approveVersion(request, resource.publicId, uploaded.payload.version.public_id, moderator);
  expect(approvedV2).toMatchObject({ status: 'published', recommended: true });
  const publicAfterApprove = unwrap(await (await request.get(
    `${API_URL}/api/v1/resources/${resource.publicId}/versions`,
  )).json());
  const publicV1 = publicAfterApprove.items.find((version: any) => version.public_id === initial.public_id);
  const publicV2 = publicAfterApprove.items.find((version: any) => version.public_id === uploaded.payload.version.public_id);
  expect(publicV1?.recommended).toBe(false);
  expect(publicV2?.recommended).toBe(true);
  expect(publicAfterApprove.items.map((version: any) => version.public_id)).not.toEqual(expect.arrayContaining([
    revisionA.payload.version.public_id, revisionB.payload.version.public_id,
  ]));

  const legacyDetail = unwrap(await (await request.get(
    `${API_URL}/api/resources/${resource.id}`,
    { headers: headers(owner) },
  )).json());
  const latestLegacyVersion = legacyDetail.versions.find((version: any) => version.public_id === uploaded.payload.version.public_id);
  expect(legacyDetail.latest_published_version_id).toBe(latestLegacyVersion.id);
  const transferOne = await createExternalResource(request, owner, `E2E V2 transfer C wins ${stamp}`);
  await startTransfer(request, transferOne.publicId, 'e2e_moderator', owner);
  await startTransfer(request, transferOne.publicId, 'e2e_admin', owner);
  const invalidFalse = await respondToTransfer(request, transferOne.publicId, 'false', moderator);
  expect(invalidFalse.status()).toBe(400);
  const cAccepts = await respondToTransfer(request, transferOne.publicId, true, admin);
  expect(cAccepts.ok()).toBeTruthy();
  const revokedB = await respondToTransfer(request, transferOne.publicId, true, moderator);
  expect(revokedB.status()).toBe(404);
  const transferOneDetail = unwrap(await (await request.get(
    `${API_URL}/api/resources/${transferOne.id}`, { headers: headers(admin) },
  )).json());
  expect(transferOneDetail.user.username).toBe('e2e_admin');

  const transferTwo = await createExternalResource(request, owner, `E2E V2 transfer B wins ${stamp}`);
  await startTransfer(request, transferTwo.publicId, 'e2e_admin', owner);
  await startTransfer(request, transferTwo.publicId, 'e2e_moderator', owner);
  const invalidTrue = await respondToTransfer(request, transferTwo.publicId, 'true', moderator);
  expect(invalidTrue.status()).toBe(400);
  const bAccepts = await respondToTransfer(request, transferTwo.publicId, true, moderator);
  expect(bAccepts.ok()).toBeTruthy();
  const revokedC = await respondToTransfer(request, transferTwo.publicId, true, admin);
  expect(revokedC.status()).toBe(404);
  const transferTwoDetail = unwrap(await (await request.get(
    `${API_URL}/api/resources/${transferTwo.id}`, { headers: headers(moderator) },
  )).json());
  expect(transferTwoDetail.user.username).toBe('e2e_moderator');

  const transferThree = await createExternalResource(request, owner, `E2E V2 transfer explicit reject ${stamp}`);
  await startTransfer(request, transferThree.publicId, 'e2e_admin', owner);
  const rejectInvite = await respondToTransfer(request, transferThree.publicId, false, admin);
  expect(rejectInvite.ok()).toBeTruthy();
  expect(unwrap(await rejectInvite.json())).toMatchObject({ accepted: false });
});
