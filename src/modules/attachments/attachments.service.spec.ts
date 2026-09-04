import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => undefined }));
jest.mock('@entities/attachment.entity', () => ({ Attachment: class Attachment {} }));
jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/reply.entity', () => ({ Reply: class Reply {} }));

import { AttachmentsService } from './attachments.service';

describe('AttachmentsService moderation storage', () => {
  const originalCwd = process.cwd();
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mindforum-attachment-service-'));
    process.chdir(tempRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('moves a pending attachment to public storage only on approval', async () => {
    const pendingDir = path.join(tempRoot, 'uploads/.quarantine/attachments/pending');
    await fs.mkdir(pendingDir, { recursive: true });
    const source = path.join(pendingDir, 'file.txt');
    await fs.writeFile(source, 'pending');
    const attachment = { id: 7, status: 'pending', file_path: source };
    const repository = { findOne: jest.fn().mockResolvedValue(attachment), update: jest.fn().mockResolvedValue(undefined) };
    const service = new AttachmentsService(repository as any, {} as any, {} as any);

    const approved = await service.approve(7);
    const target = path.join(tempRoot, 'uploads/attachments/file.txt');

    await expect(fs.readFile(target, 'utf8')).resolves.toBe('pending');
    await expect(fs.access(source)).rejects.toThrow();
    expect(approved).toEqual(expect.objectContaining({ status: 'approved', file_path: target }));
    expect(repository.update).toHaveBeenCalledWith(7, { file_path: target, status: 'approved' });
  });

  it('does not expose a pending attachment through the download path', async () => {
    const attachment = { id: 8, status: 'pending', file_path: path.join(tempRoot, 'ignored.bin') };
    const repository = { findOne: jest.fn().mockResolvedValue(attachment) };
    const service = new AttachmentsService(repository as any, {} as any, {} as any);

    await expect(service.getForDownload(8)).rejects.toThrow('Attachment not found');
  });
});
