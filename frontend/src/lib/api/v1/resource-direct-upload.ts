import { requestV1 } from './transport';

export type ResourceDirectUploadDraftResponse = {
  resource_public_id: string;
  resource_id?: number;
  version_public_id: string;
  upload_draft_id: string;
  expires_at: string;
  draft_status: 'open' | 'completed';
  version_status: 'upload_pending' | 'pending_review';
  revision?: number;
};

export type ResourceDirectVersionDraftInput = {
  version: string;
  version_mode?: 'semver' | 'compatibility';
  release_channel?: 'release' | 'beta' | 'alpha' | 'snapshot';
  game_version_min?: string;
  game_version_max?: string;
  content?: string;
  mod_id?: string;
  mod_author_overrides?: Record<string, unknown>;
};

type ResourceDirectUploadInitResponse = {
  id: string;
  deduplicated: boolean;
  complete_required: true;
  object_public_id?: string;
  upload?: { session_id: string; url: string; token: string; expires_at: string };
};

type ResourceDirectUploadCompleteResponse = { file_public_id: string; completed: true; version_public_id?: string };

/** Create a first-resource metadata draft before sending the file to ResourceStorage. */
export async function createResourceDirectUploadDraft(
  input: Record<string, unknown>,
  idempotencyKey: string,
): Promise<ResourceDirectUploadDraftResponse> {
  return requestV1<ResourceDirectUploadDraftResponse>('/resources/direct-drafts', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Create a version metadata draft in the existing Resource before file transfer. */
export async function createResourceDirectVersionDraft(
  publicId: string,
  input: ResourceDirectVersionDraftInput,
  idempotencyKey: string,
): Promise<ResourceDirectUploadDraftResponse> {
  return requestV1<ResourceDirectUploadDraftResponse>(
    `/resources/${encodeURIComponent(publicId)}/versions/direct-drafts`,
    { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) },
  );
}

/** Upload bytes to the short-lived RES URL and atomically complete the Forum binding. */
export async function uploadResourceDirectDraft(
  versionPublicId: string,
  file: File,
  knownSha256?: string,
): Promise<ResourceDirectUploadCompleteResponse> {
  let sha256 = knownSha256;
  if (!sha256) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  const init = await requestV1<ResourceDirectUploadInitResponse>('/resources/uploads/init', {
    method: 'POST',
    body: JSON.stringify({
      version_public_id: versionPublicId,
      filename: file.name,
      size_bytes: file.size,
      mime_type: file.type || 'application/octet-stream',
      sha256,
    }),
  });

  let objectPublicId = init.object_public_id;
  if (!init.deduplicated) {
    const upload = init.upload;
    if (!upload?.url || !upload.token) throw new Error('资源存储没有返回有效上传会话');
    const url = new URL(upload.url);
    const localHttpHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!url.pathname.startsWith('/upload/') || (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHttpHost))) {
      throw new Error('资源存储上传地址无效');
    }
    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${upload.token}`, 'Content-Type': 'application/octet-stream' },
      body: file,
      credentials: 'omit',
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`资源文件上传失败（HTTP ${response.status}）`);
    const result = await response.json() as { object?: { public_id?: string } };
    objectPublicId = result.object?.public_id;
  }

  if (!objectPublicId) throw new Error('资源存储没有确认上传对象');
  return requestV1<ResourceDirectUploadCompleteResponse>('/resources/uploads/complete', {
    method: 'POST',
    body: JSON.stringify({ session_id: init.id, object_public_id: objectPublicId }),
  });
}
