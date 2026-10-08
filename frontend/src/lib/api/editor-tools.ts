import { buildPublicApiUrl } from './client';
import { unwrapApiPayload } from './response';
import type { ResourceV2SchematicBlock } from './v1/resources';

export async function editorToolRequest<T>(kind: 'schematic' | 'map', action: 'analyze' | 'export' | 'region', file: File, operations?: unknown, region?: { x: number; y: number }): Promise<T> {
  const body = new FormData(); body.append('file', file); if (operations) body.append('operations', JSON.stringify(operations));
  const csrfToken = () => document.cookie.split('; ').find(item => item.startsWith('csrf_token='))?.slice(11);
  if (!csrfToken()) await fetch(buildPublicApiUrl('/api/auth/check'), { credentials: 'include' });
  const send = () => {
    const csrf = csrfToken();
    return fetch(buildPublicApiUrl(`/api/resources/editor/${kind}/${action}${region ? `?x=${region.x}&y=${region.y}` : ''}`), { method: 'POST', credentials: 'include', headers: csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}, body });
  };
  let response = await send();
  if (response.status === 403) {
    const failure = await response.clone().json().catch(() => ({}));
    // Concurrent initial GETs can issue a newer cookie after a request's header
    // was read. Retry this stateless operation once with the current token.
    if (failure.message === 'CSRF token invalid') response = await send();
  }
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.message || error.error?.message || '文件处理失败，请检查文件与编辑操作'); }
  return (action === 'export' ? await response.blob() : unwrapApiPayload(await response.json())) as T;
}
export type EditorToolAnalysis = { metadata: Record<string, unknown>; blocks: ResourceV2SchematicBlock[] };
