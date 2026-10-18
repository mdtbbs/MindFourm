import { fetchV1, requestV1 } from './transport';
import { MAX_RESOURCE_SIZE } from '../../resource-upload-limits';

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
type ResourceDirectUploadStatus = ResourceDirectUploadCompleteResponse | {
  completed: false; session_id: string; status: 'processing'; poll_after_ms: number;
};

/** Each status request is short even when server-side verification takes minutes. */
export async function waitForResourceUploadCompletion(
  sessionId: string,
  initial: ResourceDirectUploadStatus,
): Promise<ResourceDirectUploadCompleteResponse> {
  let result = initial;
  const deadline = Date.now() + 15 * 60_000;
  while (!result.completed) {
    if (Date.now() >= deadline) throw new Error('资源文件仍在后台校验，请稍后在我的资源中查看结果');
    const delay = Math.max(1000, Math.min(10000, result.poll_after_ms || 3000));
    await new Promise(resolve => setTimeout(resolve, delay));
    result = await fetchV1<ResourceDirectUploadStatus>(`/resources/uploads/${encodeURIComponent(sessionId)}/status`, {
      init: { cache: 'no-store' },
    });
  }
  return result;
}

function normalizedUploadMime(file: File): string {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.rar') || lowerName.endsWith('.7z') || lowerName.endsWith('.tar')) {
    return 'application/octet-stream';
  }
  return file.type || 'application/octet-stream';
}

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
  if (file.size > MAX_RESOURCE_SIZE) throw new Error('资源文件不能超过 120 MiB');
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
      mime_type: normalizedUploadMime(file),
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
  const completion = await requestV1<ResourceDirectUploadStatus>('/resources/uploads/complete', {
    method: 'POST',
    body: JSON.stringify({ session_id: init.id, object_public_id: objectPublicId, background: true }),
  });
  return waitForResourceUploadCompletion(init.id, completion);
}
