import { fetchV1, requestV1, requestV1Blob } from './transport';

export type ResourceV2ReportAttachment = {
  public_id: string;
  kind: 'log' | 'image';
  name: string;
  size_bytes: number;
  mime_type: string;
  sha256: string;
  created_at: string;
  download_url: string;
  can_delete: boolean;
};

export type ResourceV2ReportAttachmentList = {
  items: ResourceV2ReportAttachment[];
  max_attachments: number;
  max_file_size_bytes: number;
  max_total_size_bytes: number;
};

export type ResourceV2ReportAttachmentKind = 'issue' | 'compatibility';

const reportPath = (kind: ResourceV2ReportAttachmentKind) => kind === 'issue'
  ? 'issue-reports'
  : 'compatibility-reports';

function collectionPath(kind: ResourceV2ReportAttachmentKind, reportPublicId: string): string {
  return `/resources/mods/${reportPath(kind)}/${encodeURIComponent(reportPublicId)}/attachments`;
}

export const RESOURCE_V2_REPORT_ATTACHMENT_MAX_FILES = 10;
export const RESOURCE_V2_REPORT_ATTACHMENT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const RESOURCE_V2_REPORT_ATTACHMENT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export async function uploadResourceV2ReportAttachment(
  kind: ResourceV2ReportAttachmentKind,
  reportPublicId: string,
  file: File,
): Promise<ResourceV2ReportAttachment> {
  const body = new FormData();
  body.append('file', file);
  return requestV1<ResourceV2ReportAttachment>(collectionPath(kind, reportPublicId), {
    method: 'POST',
    body,
  });
}

export async function listResourceV2ReportAttachments(
  kind: ResourceV2ReportAttachmentKind,
  reportPublicId: string,
): Promise<ResourceV2ReportAttachmentList> {
  return fetchV1<ResourceV2ReportAttachmentList>(collectionPath(kind, reportPublicId));
}

export async function downloadResourceV2ReportAttachment(
  kind: ResourceV2ReportAttachmentKind,
  reportPublicId: string,
  attachmentPublicId: string,
): Promise<Blob> {
  return requestV1Blob(`${collectionPath(kind, reportPublicId)}/${encodeURIComponent(attachmentPublicId)}`, {
    method: 'GET',
  });
}

export async function deleteResourceV2ReportAttachment(
  kind: ResourceV2ReportAttachmentKind,
  reportPublicId: string,
  attachmentPublicId: string,
): Promise<{ public_id: string; deleted: boolean }> {
  return requestV1<{ public_id: string; deleted: boolean }>(
    `${collectionPath(kind, reportPublicId)}/${encodeURIComponent(attachmentPublicId)}`,
    { method: 'DELETE' },
  );
}
