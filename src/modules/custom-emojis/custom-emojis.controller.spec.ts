const decorator = () => () => undefined;

// Capture the upload options the controller hands to multer so the extension /
// mimetype whitelist can be exercised without booting the HTTP layer.
var capturedUpload: { field?: string; options?: any } = {};

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
  ManyToOne: decorator,
  OneToMany: decorator,
  ManyToMany: decorator,
  OneToOne: decorator,
  JoinColumn: decorator,
  JoinTable: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
  Unique: decorator,
}));

jest.mock('@entities/index', () => ({ CustomEmoji: class CustomEmoji {} }));

jest.mock('@common/guards/jwt-auth.guard', () => ({ JwtAuthGuard: class JwtAuthGuard {} }));
jest.mock('@common/guards/roles.guard', () => ({ RolesGuard: class RolesGuard {} }));

jest.mock('@nestjs/platform-express', () => ({
  FileInterceptor: (field: string, options: any) => {
    capturedUpload = { field, options };
    return () => undefined;
  },
}));

// `diskStorage` only normalizes its config in real multer.
jest.mock('multer', () => ({ diskStorage: (config: any) => config }));

jest.mock('@common/utils/upload-safety.util', () => ({
  assertSafeUploadedFile: jest.fn(),
}));

const rmMock = jest.fn(async () => undefined);
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(async () => undefined),
  rm: (...args: unknown[]) => rmMock(...(args as [])),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import * as path from 'path';
import { Writable } from 'stream';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { CustomEmojisController } from './custom-emojis.controller';

const ROOT = path.resolve('./uploads/custom-emojis');
const assertSafe = assertSafeUploadedFile as unknown as jest.Mock;

interface ServiceStub {
  listEnabled: jest.Mock;
  listAll: jest.Mock;
  getEnabled: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  remove: jest.Mock;
}

function createService(): ServiceStub {
  return {
    listEnabled: jest.fn(),
    listAll: jest.fn(),
    getEnabled: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

function createController(service: ServiceStub = createService()) {
  return { controller: new CustomEmojisController(service as any), service };
}

function uploadedFile(overrides: Record<string, unknown> = {}) {
  return {
    originalname: 'laugh.png',
    mimetype: 'image/png',
    path: path.join(ROOT, '1-laugh.png'),
    size: 128,
    ...overrides,
  } as Express.Multer.File;
}

const acceptedTypes: Array<[string, string]> = [
  ['image/png', 'laugh.png'],
  ['image/png', 'laugh.PNG'],
  ['image/gif', 'laugh.gif'],
  ['image/webp', 'laugh.webp'],
];

const rejectedTypes: Array<[string, string]> = [
  ['image/png', 'laugh.gif'],
  ['image/jpeg', 'laugh.jpg'],
  ['image/svg+xml', 'laugh.svg'],
  ['image/png', 'laugh'],            // no extension at all
  ['image/png', 'laugh.png.exe'],    // real extension is not the whitelisted one
  ['', 'laugh.png'],
];

beforeEach(() => {
  rmMock.mockClear();
  assertSafe.mockReset();
  assertSafe.mockResolvedValue(undefined);
});

describe('CustomEmojisController upload whitelist', () => {
  it('registers the file interceptor with a 1 MiB limit', () => {
    expect(capturedUpload.field).toBe('file');
    expect(capturedUpload.options.limits).toEqual({ fileSize: 1024 * 1024 });
  });

  it('accepts only matching mimetype/extension pairs', () => {
    const { fileFilter } = capturedUpload.options;

    for (const [mimetype, originalname] of acceptedTypes) {
      const callback = jest.fn();
      fileFilter({}, { mimetype, originalname }, callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    }

    for (const [mimetype, originalname] of rejectedTypes) {
      const callback = jest.fn();
      fileFilter({}, { mimetype, originalname }, callback);
      expect(callback).toHaveBeenCalledWith(new Error('Unsupported emoji image'), false);
    }
  });

  it('derives the stored file name from the whitelisted mimetype', () => {
    const { filename } = capturedUpload.options.storage;
    const extensions: Record<string, string> = { 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };

    for (const [mimetype] of acceptedTypes) {
      const callback = jest.fn();
      filename({}, { mimetype }, callback);
      const [, name] = callback.mock.calls[0];
      const extension = extensions[mimetype].replace('.', '\\.');
      expect(name).toMatch(new RegExp('^[0-9]+-[a-z0-9]+' + extension + '$'));
    }

    // Two calls in the same millisecond must not collide.
    const callback = jest.fn();
    filename({}, { mimetype: 'image/png' }, callback);
    filename({}, { mimetype: 'image/png' }, callback);
    expect(callback.mock.calls[0][1]).not.toBe(callback.mock.calls[1][1]);
  });

  it('leaves the name extension-less for a mimetype outside the whitelist', () => {
    const callback = jest.fn();
    capturedUpload.options.storage.filename({}, { mimetype: 'image/svg+xml' }, callback);
    expect(callback.mock.calls[0][1]).toMatch(/^[0-9]+-[a-z0-9]+$/);
  });

  it('stores uploads under uploads/custom-emojis', async () => {
    const callback = jest.fn();
    capturedUpload.options.storage.destination({}, {}, callback);
    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith(null, ROOT);
  });
});

describe('CustomEmojisController.list / image / update / remove', () => {
  it('decorates the enabled list with an image url', async () => {
    const service = createService();
    service.listEnabled.mockResolvedValue([
      { id: 1, name: '大笑', shortcode: 'laugh', sort_order: 0 },
      { id: 2, name: '哭', shortcode: 'cry', sort_order: 3 },
    ]);
    const { controller } = createController(service);

    await expect(controller.list()).resolves.toEqual([
      { id: 1, name: '大笑', shortcode: 'laugh', sort_order: 0, image_url: '/api/custom-emojis/1/image' },
      { id: 2, name: '哭', shortcode: 'cry', sort_order: 3, image_url: '/api/custom-emojis/2/image' },
    ]);
  });

  it('sets hardening headers and streams the image', async () => {
    const service = createService();
    const fileName = 'stream-test-' + Date.now() + '.png';
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(path.join(ROOT, fileName), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    service.getEnabled.mockResolvedValue({ id: 4, mime_type: 'image/png', file_path: path.join(ROOT, fileName) });
    const { controller } = createController(service);

    const chunks: Buffer[] = [];
    const response: any = new Writable({
      write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); },
    });
    response.setHeader = jest.fn();
    response.headersSent = false;

    await controller.image(4, response);
    await new Promise((resolve) => response.on('finish', resolve));

    expect(service.getEnabled).toHaveBeenCalledWith(4);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(response.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    rmSync(path.join(ROOT, fileName), { force: true });
  });

  it('refuses to serve a file outside the uploads directory', async () => {
    const service = createService();
    service.getEnabled.mockResolvedValue({ id: 5, mime_type: 'image/png', file_path: '/etc/passwd' });
    const { controller } = createController(service);

    await expect(controller.image(5, { setHeader: jest.fn() } as any)).rejects.toThrow(NotFoundException);
  });

  it('answers 404 when the stored file disappeared', async () => {
    const service = createService();
    service.getEnabled.mockResolvedValue({ id: 6, mime_type: 'image/png', file_path: path.join(ROOT, 'gone.png') });
    const { controller } = createController(service);

    const response: any = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    response.headersSent = false;
    response.setHeader = jest.fn();
    response.status = jest.fn(function (this: any) { return this; });
    response.end = jest.fn();

    await controller.image(6, response);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.end).toHaveBeenCalled();
    expect(existsSync(path.join(ROOT, 'gone.png'))).toBe(false);
  });

  it('passes the update body straight through to the service', async () => {
    const service = createService();
    service.update.mockResolvedValue({ id: 7 });
    const { controller } = createController(service);

    await controller.update(7, { name: '新名字', is_enabled: false, sort_order: 4 });

    expect(service.update).toHaveBeenCalledWith(7, { name: '新名字', is_enabled: false, sort_order: 4 });
  });

  it('removes the stored file for emojis inside the uploads directory and reports deletion', async () => {
    const service = createService();
    service.remove.mockResolvedValue({ id: 8, file_path: path.join(ROOT, '8.png') });
    const { controller } = createController(service);

    await expect(controller.remove(8)).resolves.toEqual({ deleted: true });
    expect(service.remove).toHaveBeenCalledWith(8);
    expect(rmMock).toHaveBeenCalledWith(path.join(ROOT, '8.png'), { force: true });
  });

  it('keeps unrelated files when the emoji path escapes the uploads directory', async () => {
    const service = createService();
    service.remove.mockResolvedValue({ id: 9, file_path: '/etc/passwd' });
    const { controller } = createController(service);

    await expect(controller.remove(9)).resolves.toEqual({ deleted: true });
    expect(rmMock).not.toHaveBeenCalled();
  });
});

describe('CustomEmojisController.create', () => {
  it('requires a file', async () => {
    const { controller, service } = createController();

    await expect(controller.create(undefined as any, { name: 'x', shortcode: 'x' }, {} as any))
      .rejects.toThrow(BadRequestException);
    await expect(controller.create(undefined as any, {}, {} as any))
      .rejects.toThrow('请选择 PNG、GIF 或 WebP 表情图片');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('normalizes the multipart body and forwards the uploader id', async () => {
    const service = createService();
    service.create.mockImplementation(async (input: any) => ({ id: 10, ...input }));
    const { controller } = createController(service);

    const created = await controller.create(
      uploadedFile({ originalname: 'laugh.png', path: path.join(ROOT, '10-laugh.png') }),
      { name: '大笑', shortcode: 'laugh' },
      { user: { id: 42 } } as any,
    );

    expect(assertSafe).toHaveBeenCalledWith(expect.objectContaining({ path: path.join(ROOT, '10-laugh.png') }), 1024 * 1024);
    expect(service.create).toHaveBeenCalledWith({
      name: '大笑',
      shortcode: 'laugh',
      file_name: 'laugh.png',
      file_path: path.join(ROOT, '10-laugh.png'),
      mime_type: 'image/png',
      created_by_user_id: 42,
    });
    expect(created).toMatchObject({ id: 10, shortcode: 'laugh' });
    expect(rmMock).not.toHaveBeenCalled();
  });

  it('coerces missing or non-string body fields to strings and trims the stored name', async () => {
    const service = createService();
    service.create.mockResolvedValue({ id: 11 });
    const { controller } = createController(service);

    await controller.create(uploadedFile(), {}, { user: undefined } as any);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({
      name: '',
      shortcode: '',
      created_by_user_id: NaN,
    }));

    await controller.create(uploadedFile({ originalname: 'x'.repeat(300) + '.png' }), { name: 5 as any, shortcode: null as any }, { user: { id: 1 } } as any);
    const lastCall = service.create.mock.calls[service.create.mock.calls.length - 1][0];
    expect(lastCall.name).toBe('5');
    // `null` is falsy, so the controller falls back to the empty string.
    expect(lastCall.shortcode).toBe('');
    expect(lastCall.file_name).toHaveLength(255);
  });

  it('deletes the stored file when the upload fails validation', async () => {
    const service = createService();
    const { controller } = createController(service);
    const error = new BadRequestException('文件内容与扩展名不匹配');
    assertSafe.mockRejectedValue(error);

    await expect(controller.create(uploadedFile(), { name: 'a', shortcode: 'a' }, { user: { id: 1 } } as any)).rejects.toBe(error);
    expect(rmMock).toHaveBeenCalledWith(path.join(ROOT, '1-laugh.png'), { force: true });
    expect(service.create).not.toHaveBeenCalled();
  });

  it('deletes the stored file when the service rejects the emoji', async () => {
    const service = createService();
    const error = new BadRequestException('shortcode 仅允许小写字母、数字和 _+-');
    service.create.mockRejectedValue(error);
    const { controller } = createController(service);

    await expect(controller.create(uploadedFile(), { name: 'a', shortcode: 'BAD' }, { user: { id: 1 } } as any)).rejects.toBe(error);
    expect(rmMock).toHaveBeenCalledWith(path.join(ROOT, '1-laugh.png'), { force: true });
  });
});
