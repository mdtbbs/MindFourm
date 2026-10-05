import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  MAX_MOD_REPORT_ATTACHMENT_BYTES, MAX_MOD_REPORT_ATTACHMENT_TOTAL_BYTES, ResourceV2ReportAttachmentService,
} from './resource-v2-report-attachment.service';

const ids = {
  report: '30000000-0000-4000-8000-000000000001',
  attachment: '40000000-0000-4000-8000-000000000001',
  resource: '10000000-0000-4000-8000-000000000001',
};

const imageBytes = (() => {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(1, 16);
  buffer.writeUInt32BE(1, 20);
  return buffer;
})();

type HarnessOptions = {
  reporterId?: number;
  resourceOwnerId?: number;
  actorRole?: string;
  memberRole?: string | null;
  memberStatus?: string | null;
  phoneVerified?: number;
  count?: number;
  totalBytes?: number;
};

function createHarness(options: HarnessOptions = {}) {
  const attachmentPath = '/uploads/.quarantine/resources/private-report-evidence.png';
  const attachmentRow = {
    public_id: ids.attachment,
    kind: 'image',
    file_name: 'client.png',
    file_path: attachmentPath,
    mime_type: 'image/png',
    file_size: imageBytes.length,
    sha256: createHash('sha256').update(imageBytes).digest('hex'),
    created_at: new Date('2026-10-05T10:00:00.000Z'),
  };
  const reportRow = {
    report_id: 80,
    report_public_id: ids.report,
    reporter_user_id: options.reporterId ?? 10,
    resource_id: 20,
    resource_public_id: ids.resource,
    resource_owner_user_id: options.resourceOwnerId ?? 20,
    actor_role: options.actorRole ?? 'user',
    member_role: options.memberRole ?? null,
    member_status: options.memberStatus ?? null,
  };
  const uploadedPath = '/uploads/.quarantine/resources/new-private-report-evidence.png';
  const inserted: any[] = [];
  const removedPaths: string[] = [];
  const readManagedFile = jest.fn(async () => imageBytes);

  const execute = async (sql: string, params: any[] = []) => {
    if (sql.includes('SELECT phone_verified FROM users')) return [{ phone_verified: options.phoneVerified ?? 1 }];
    if (sql.includes('FROM mod_issue_reports report') || sql.includes('FROM mod_compatibility_reports report')) {
      if (!sql.includes('WHERE report.id=?') && String(params[params.length - 1]) !== ids.report) return [];
      if (String(params[params.length - 1]) === ids.report) return [{ ...reportRow }];
      return [];
    }
    if (sql.includes('SELECT COUNT(*) AS attachment_count')) {
      return [{ attachment_count: options.count ?? 0, total_bytes: options.totalBytes ?? 0 }];
    }
    if (sql.includes('FROM mod_report_attachments') && sql.includes('public_id=?')) {
      return String(params[1]) === ids.attachment ? [{ ...attachmentRow }] : [];
    }
    if (sql.includes('FROM mod_report_attachments') && sql.includes('ORDER BY created_at')) {
      return [{ ...attachmentRow }];
    }
    if (sql.startsWith('INSERT INTO mod_report_attachments')) {
      inserted.push({ sql, params });
      return [];
    }
    if (sql.startsWith('DELETE FROM mod_report_attachments')) return [];
    return [];
  };
  const manager = { query: jest.fn(execute) };
  const dataSource = {
    query: jest.fn(execute),
    transaction: jest.fn(async (callback: (manager: any) => Promise<unknown>) => callback(manager)),
  } as any;
  const storage = {
    storeIncoming: jest.fn(async () => ({
      file_name: 'stored.png', file_path: uploadedPath, file_size: imageBytes.length,
      mime_type: 'image/png', content_hash: createHash('sha256').update(imageBytes).digest('hex'),
    })),
    readQuarantinedFile: readManagedFile,
    removeQuarantinedFile: jest.fn(async (filePath: string) => { removedPaths.push(filePath); return true; }),
  };
  return {
    service: new ResourceV2ReportAttachmentService(dataSource, storage as any),
    dataSource, manager, storage, reportRow, attachmentRow, inserted, removedPaths, readManagedFile,
    uploadedPath,
  };
}

describe('ResourceV2ReportAttachmentService', () => {
  let tempRoot: string;

  beforeEach(async () => { tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-report-attachment-')); });
  afterEach(async () => { await fs.rm(tempRoot, { recursive: true, force: true }); });

  const imageFile = async (name = 'client.png'): Promise<Express.Multer.File> => {
    const filePath = path.join(tempRoot, name);
    await fs.writeFile(filePath, imageBytes);
    return { path: filePath, originalname: name, filename: 'upload.png', size: imageBytes.length, mimetype: 'image/png' } as Express.Multer.File;
  };

  it('stores a verified image for the report author and returns only safe UUID metadata', async () => {
    const harness = createHarness();
    const result = await harness.service.add('issue', ids.report, 10, await imageFile());

    expect(result).toMatchObject({ kind: 'image', name: 'client.png', mime_type: 'image/png', size_bytes: imageBytes.length });
    expect(result.public_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.download_url).toContain(`/issue-reports/${ids.report}/attachments/${result.public_id}`);
    expect(result).not.toHaveProperty('file_path');
    expect(result).not.toHaveProperty('id');
    expect(harness.inserted).toHaveLength(1);
    expect(harness.inserted[0].sql).toContain('issue_report_id');
    expect(harness.inserted[0].params).toContain(harness.uploadedPath);
    expect(harness.storage.storeIncoming).toHaveBeenCalledTimes(1);
  });

  it('writes compatibility evidence with exactly the compatibility parent column', async () => {
    const harness = createHarness();
    await harness.service.add('compatibility', ids.report, 10, await imageFile());

    expect(harness.inserted).toHaveLength(1);
    expect(harness.inserted[0].sql).toContain('(public_id,compatibility_report_id,kind');
    expect(harness.inserted[0].sql).not.toContain('issue_report_id');
  });

  it('rejects non-owners, unverified phone numbers, invalid signatures, and quota overflow before storing', async () => {
    const nonOwner = createHarness({ reporterId: 11 });
    await expect(nonOwner.service.add('issue', ids.report, 10, await imageFile()))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(nonOwner.storage.storeIncoming).not.toHaveBeenCalled();

    const unverified = createHarness({ phoneVerified: 0 });
    await expect(unverified.service.add('issue', ids.report, 10, await imageFile()))
      .rejects.toMatchObject({ response: { code: 'PHONE_VERIFICATION_REQUIRED' } });
    expect(unverified.storage.storeIncoming).not.toHaveBeenCalled();

    const invalid = createHarness();
    const invalidFile = await imageFile('spoof.jpg');
    await expect(invalid.service.add('issue', ids.report, 10, invalidFile)).rejects.toBeInstanceOf(BadRequestException);
    expect(invalid.storage.storeIncoming).not.toHaveBeenCalled();

    const full = createHarness({ count: 10 });
    await expect(full.service.add('issue', ids.report, 10, await imageFile())).rejects.toBeInstanceOf(BadRequestException);
    expect(full.storage.storeIncoming).not.toHaveBeenCalled();

    const totalFull = createHarness({ totalBytes: MAX_MOD_REPORT_ATTACHMENT_TOTAL_BYTES });
    await expect(totalFull.service.add('issue', ids.report, 10, await imageFile())).rejects.toBeInstanceOf(BadRequestException);
    expect(totalFull.storage.storeIncoming).not.toHaveBeenCalled();

    const oversizedPath = path.join(tempRoot, 'oversized.png');
    await fs.writeFile(oversizedPath, '');
    await fs.truncate(oversizedPath, MAX_MOD_REPORT_ATTACHMENT_BYTES + 1);
    const oversized = createHarness();
    await expect(oversized.service.add('issue', ids.report, 10, {
      path: oversizedPath, originalname: 'oversized.png', filename: 'oversized.png',
      size: MAX_MOD_REPORT_ATTACHMENT_BYTES + 1, mimetype: 'image/png',
    } as Express.Multer.File)).rejects.toBeInstanceOf(BadRequestException);
    expect(oversized.storage.storeIncoming).not.toHaveBeenCalled();
  });

  it('lists safe metadata and authorizes private reads for report participants only', async () => {
    const owner = createHarness({ actorRole: 'user', resourceOwnerId: 10 });
    const listed = await owner.service.list('issue', ids.report, 10);
    expect(listed.items[0]).toMatchObject({ public_id: ids.attachment, name: 'client.png', kind: 'image' });
    expect(listed.items[0].can_delete).toBe(true);
    expect(listed.items[0]).not.toHaveProperty('file_path');
    expect(listed.items[0]).not.toHaveProperty('resource_id');

    const resourceManager = createHarness({ reporterId: 10, resourceOwnerId: 20 });
    const managerList = await resourceManager.service.list('issue', ids.report, 20);
    expect(managerList.items[0].can_delete).toBe(false);

    const moderator = createHarness({ reporterId: 99, actorRole: 'moderator' });
    await expect(moderator.service.read('issue', ids.report, ids.attachment, 55))
      .resolves.toMatchObject({ mime_type: 'image/png', size_bytes: imageBytes.length });
    expect(moderator.readManagedFile).toHaveBeenCalledWith(moderator.attachmentRow.file_path, 5 * 1024 * 1024);

    const stranger = createHarness({ reporterId: 10, resourceOwnerId: 20, actorRole: 'user' });
    await expect(stranger.service.list('issue', ids.report, 55)).rejects.toBeInstanceOf(NotFoundException);
    expect(stranger.readManagedFile).not.toHaveBeenCalled();
  });

  it('deletes evidence only for its report author and cleans the managed quarantine file', async () => {
    const author = createHarness();
    await expect(author.service.remove('issue', ids.report, ids.attachment, 10)).resolves.toEqual({
      public_id: ids.attachment, deleted: true,
    });
    expect(author.removedPaths).toEqual([author.attachmentRow.file_path]);

    const owner = createHarness({ reporterId: 99, resourceOwnerId: 10 });
    await expect(owner.service.remove('issue', ids.report, ids.attachment, 10)).rejects.toBeInstanceOf(NotFoundException);
    expect(owner.removedPaths).toHaveLength(0);
  });

  it('accepts UTF-8 log files and rejects binary log payloads', async () => {
    const validPath = path.join(tempRoot, 'server.log');
    await fs.writeFile(validPath, 'server started\nerror: failed to load mod\n');
    const validFile = { path: validPath, originalname: 'server.log', filename: 'upload.log', size: (await fs.stat(validPath)).size, mimetype: 'application/octet-stream' } as Express.Multer.File;
    const valid = createHarness();
    await expect(valid.service.add('compatibility', ids.report, 10, validFile)).resolves.toMatchObject({ kind: 'log', mime_type: 'text/plain' });
    expect(valid.inserted[0].sql).toContain('compatibility_report_id');

    const binaryPath = path.join(tempRoot, 'server2.log');
    await fs.writeFile(binaryPath, Buffer.from([0x61, 0x00, 0x62]));
    const binaryFile = { path: binaryPath, originalname: 'server2.log', filename: 'upload.log', size: 3, mimetype: 'text/plain' } as Express.Multer.File;
    const invalid = createHarness();
    await expect(invalid.service.add('issue', ids.report, 10, binaryFile)).rejects.toBeInstanceOf(BadRequestException);
    expect(invalid.storage.storeIncoming).not.toHaveBeenCalled();
  });
});
