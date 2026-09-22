import { attachmentContentDisposition } from './content-disposition.util';

describe('attachmentContentDisposition', () => {
  it('keeps a UTF-8 filename in RFC 5987 filename* with an ASCII fallback', () => {
    expect(attachmentContentDisposition('测试 地图.zip')).toBe(
      "attachment; filename=\"__ __.zip\"; filename*=UTF-8''%E6%B5%8B%E8%AF%95%20%E5%9C%B0%E5%9B%BE.zip",
    );
  });

  it('does not allow quotes or control characters to split the header', () => {
    expect(attachmentContentDisposition('a\"b\n.zip')).toContain('filename="a_b.zip"');
  });

  it('repairs a persisted mojibake filename before encoding the download header', () => {
    const mojibake = Buffer.from('(双科).msch', 'utf8').toString('latin1');
    expect(attachmentContentDisposition(mojibake)).toContain(
      "filename*=UTF-8''%28%E5%8F%8C%E7%A7%91%29.msch",
    );
  });
});
