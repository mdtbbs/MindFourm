import { createResourceDirectUploadDraft, uploadResourceDirectDraft } from '@/lib/api/v1/resource-direct-upload';

export async function publishEditorCopy(file: File, kind: 'map' | 'schematic', title: string, sourceId?: string, key = crypto.randomUUID()) {
  const sourceUrl = sourceId ? new URL(`/resources/${encodeURIComponent(sourceId)}`, window.location.origin) : null;
  const draft = await createResourceDirectUploadDraft({
    title, resource_kind: kind, resource_type: 'upload', version: '1.0.0', version_mode: 'semver', release_channel: 'release',
    is_public: 1, content: sourceId ? `基于资源 ${sourceId} 编辑的副本，原资源保持不变。` : '使用在线编辑器制作。',
    ...(sourceUrl && sourceUrl.hostname !== 'localhost' ? { source_url: sourceUrl.href } : {}),
  }, key);
  if (draft.draft_status !== 'completed') await uploadResourceDirectDraft(draft.version_public_id, file);
  return draft;
}
