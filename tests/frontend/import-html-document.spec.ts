import { JSDOM } from 'jsdom';
jest.mock('../../frontend/src/lib/tiptap/upload-image', () => ({ uploadImage: jest.fn(), importRemoteImage: jest.fn() }));
const originalParser = globalThis.DOMParser;
beforeAll(() => { globalThis.DOMParser = new JSDOM('').window.DOMParser; });
afterAll(() => { globalThis.DOMParser = originalParser; });
import { importHtmlDocument } from '../../frontend/src/lib/tiptap/import-html-document';

describe('HTML embedded image import', () => {
  it('uploads duplicate raster images once and preserves their layout', async () => {
    const upload = jest.fn().mockResolvedValue({ url: '/uploads/imported.png' });
    const html = '<html><head><style>.card{display:grid}</style></head><body><img class="card" src="data:image/png;base64,YWJj"><img src="data:image/png;base64,YWJj"></body></html>';
    const result = await importHtmlDocument(html, upload);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0].type).toBe('image/png');
    expect(result.match(/\/uploads\/imported.png/g)).toHaveLength(2);
    expect(result).not.toContain('base64');
    expect(result).toContain('<style>.card{display:grid}</style>');
    expect(result).toContain('class="card"');
  });

  it('validates all images before uploading, including SVG and oversized input', async () => {
    const upload = jest.fn();
    await expect(importHtmlDocument('<img src="data:image/png;base64,YWJj"><img src="data:image/svg+xml;base64,YWJj">', upload)).rejects.toThrow('仅支持');
    await expect(importHtmlDocument('x'.repeat(8 * 1024 * 1024 + 1), upload)).rejects.toThrow('8MB');
    expect(upload).not.toHaveBeenCalled();
  });

  it('does not rewrite legacy fragments', async () => {
    const html = '<p style="color:red">Hello</p>';
    expect(await importHtmlDocument(html, jest.fn())).toBe(html);
  });
});


describe('HTML remote image import', () => {
  it('deduplicates images and CSS URLs, resolves base URLs, and keeps site links local', async () => {
    const remote = jest.fn().mockResolvedValue({ url: '/uploads/public-images/imported.png', alt: '图' });
    const html = `<html><head><base href="https://external.test/assets/"><style>.card{background:url('./a.png')}</style></head><body><img src="a.png"><img src="https://external.test/assets/a.png#fragment"><img src="https://forum.test/uploads/public-images/local.png"><div class="card" style="background:url(https://external.test/assets/a.png)">排版</div></body></html>`;
    const result = await importHtmlDocument(html, jest.fn(), remote, 'https://forum.test');
    expect(remote).toHaveBeenCalledTimes(1);
    expect(remote).toHaveBeenCalledWith('https://external.test/assets/a.png');
    expect(result.match(/\/uploads\/public-images\/imported.png/g)).toHaveLength(4);
    expect(result).toContain('src="/uploads/public-images/local.png"');
    expect(result).toContain('class="card"');
    expect(result).not.toContain('src="https://');
  });

  it('rejects a failed download instead of preserving external URLs', async () => {
    const remote = jest.fn().mockRejectedValue(new Error('HTTP 404'));
    await expect(importHtmlDocument('<html><img src="https://external.test/missing.png"></html>', jest.fn(), remote, 'https://forum.test')).rejects.toThrow('图片导入失败（https://external.test/missing.png）：HTTP 404');
  });

  it('rejects excessive images and markup before making requests', async () => {
    const remote = jest.fn();
    await expect(importHtmlDocument(Array.from({ length: 101 }, (_, i) => `<img src="https://external.test/${i}.png">`).join(''), jest.fn(), remote)).rejects.toThrow('100 张');
    await expect(importHtmlDocument('<html>' + 'x'.repeat(200001) + '<img src="https://external.test/a.png"></html>', jest.fn(), remote)).rejects.toThrow('200000');
    expect(remote).not.toHaveBeenCalled();
  });

  it('rejects returned external links and non-HTTP image sources', async () => {
    await expect(importHtmlDocument('<img src="https://external.test/a.png">', jest.fn(), jest.fn().mockResolvedValue({ url: 'https://external.test/a.png' }))).rejects.toThrow('站内图片链接');
    await expect(importHtmlDocument('<img src="file:///etc/passwd">', jest.fn(), jest.fn())).rejects.toThrow('HTTP(S)');
  });
});
