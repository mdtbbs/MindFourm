import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { lookup } from 'dns/promises';
import * as fs from 'fs/promises';
import { assertSafeUploadedFile } from '../../common/utils/upload-safety.util';
import { isPublicImageAddress, resolveImageTarget, RemoteImageImportService } from './remote-image-import.service';

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('fs/promises', () => ({ mkdir: jest.fn(), writeFile: jest.fn(), unlink: jest.fn() }));
jest.mock('../../common/utils/upload-safety.util', () => ({ assertSafeUploadedFile: jest.fn() }));

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const get = axios.get as jest.Mock;
const dns = lookup as jest.Mock;
const safety = assertSafeUploadedFile as jest.Mock;
const uploads = { toPublicImageResult: jest.fn((file) => ({ url: `/uploads/public-images/${file.filename}`, size: file.size })) };

beforeEach(() => {
  jest.clearAllMocks();
  dns.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  safety.mockResolvedValue(undefined);
  (fs.unlink as jest.Mock).mockResolvedValue(undefined);
  get.mockResolvedValue({ status: 200, data: png, headers: {} });
});

describe('remote image target validation', () => {
  it.each(['127.0.0.1', '10.1.1.1', '169.254.169.254', '100.64.0.1', '192.168.1.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:7f00:1::'])('blocks nonpublic address %s', (address) => {
    expect(isPublicImageAddress(address)).toBe(false);
  });
  it.each(['93.184.216.34', '2606:4700:4700::1111'])('accepts public address %s', (address) => {
    expect(isPublicImageAddress(address)).toBe(true);
  });
  it.each(['file:///etc/passwd', 'http://127.1/a.png', 'https://[::ffff:127.0.0.1]/a.png', 'https://user:password@external.test/a.png', 'https://external.test:8443/a.png'])('rejects unsafe URL %s', async (url) => {
    await expect(resolveImageTarget(url)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects mixed public and private DNS responses', async () => {
    dns.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]);
    await expect(resolveImageTarget('https://external.test/a.png')).rejects.toThrow('内网');
  });
});

describe('remote image download and storage', () => {
  const service = new RemoteImageImportService(uploads as any);
  it('pins DNS and disables automatic redirects and proxies, then stores verified image bytes', async () => {
    const result = await service.importImage('https://external.test/a.png');
    expect(result.url).toMatch(/^\/uploads\/public-images\/.*\.png$/);
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringMatching(/uploads\/public-images\/.*\.png$/), png, { flag: 'wx' });
    expect(safety).toHaveBeenCalledWith(expect.objectContaining({ mimetype: 'image/png', size: png.length }), 2 * 1024 * 1024);
    const config = get.mock.calls[0][1];
    expect(config).toMatchObject({ maxRedirects: 0, proxy: false, maxContentLength: 2 * 1024 * 1024 });
    const callback = jest.fn();
    config.httpsAgent.options.lookup('external.test', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    config.httpsAgent.options.lookup('external.test', { all: true }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
    expect(dns).toHaveBeenCalledTimes(1);
  });
  it('revalidates redirects and refuses a redirect to metadata or loopback', async () => {
    get.mockResolvedValueOnce({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
    await expect(service.importImage('https://external.test/a.png')).rejects.toThrow('内网');
    expect(get).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
  it('follows relative redirects after a fresh lookup', async () => {
    get.mockResolvedValueOnce({ status: 302, headers: { location: '/actual.png' } });
    await expect(service.download('https://external.test/a.png')).resolves.toEqual(png);
    expect(get.mock.calls[1][0]).toBe('https://external.test/actual.png');
    expect(dns).toHaveBeenCalledTimes(2);
  });
  it.each([
    { status: 404, data: png, headers: {} },
    { status: 200, data: Buffer.from('<html>not an image</html>'), headers: { 'content-type': 'image/png' } },
    { status: 200, data: Buffer.alloc(2 * 1024 * 1024 + 1), headers: {} },
  ])('rejects missing, spoofed, or oversized files before storage', async (response) => {
    get.mockResolvedValue(response);
    await expect(service.importImage('https://external.test/a.png')).rejects.toBeInstanceOf(BadRequestException);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
  it('removes a file rejected by the existing upload safety checks', async () => {
    safety.mockRejectedValueOnce(new BadRequestException('图片尺寸超出安全限制'));
    await expect(service.importImage('https://external.test/a.png')).rejects.toThrow('图片尺寸');
    expect(fs.unlink).toHaveBeenCalledWith((fs.writeFile as jest.Mock).mock.calls[0][0]);
    expect(uploads.toPublicImageResult).not.toHaveBeenCalled();
  });
});
