import { BadRequestException } from '@nestjs/common';
import { assertSafeRedirectUrl, isPublicHttpUrl, isSafeExternalUrl } from './safe-url.util';

describe('isSafeExternalUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeExternalUrl('http://example.com/a.zip')).toBe(true);
    expect(isSafeExternalUrl('https://example.com/a.zip')).toBe(true);
    expect(isSafeExternalUrl('  https://example.com/a.zip  ')).toBe(true);
  });

  it('rejects script-bearing and local schemes', () => {
    // `type="url"` in the browser accepts these, and the DTO only had @IsString —
    // so a resource could redirect from a trusted domain into script execution.
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('JavaScript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects relative and empty values', () => {
    expect(isSafeExternalUrl('/relative/path')).toBe(false);
    expect(isSafeExternalUrl('example.com')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
    expect(isSafeExternalUrl('   ')).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
    expect(isSafeExternalUrl(undefined)).toBe(false);
    expect(isSafeExternalUrl(42)).toBe(false);
  });
});

describe('isPublicHttpUrl', () => {
  it('accepts ordinary public destinations', () => {
    expect(isPublicHttpUrl('https://hooks.example.com/admin')).toBe(true);
    expect(isPublicHttpUrl('http://203.0.113.10/hook')).toBe(true);
    expect(isPublicHttpUrl('https://example.com:8443/hook')).toBe(true);
  });

  it('refuses loopback and localhost', () => {
    expect(isPublicHttpUrl('http://127.0.0.1:6379/')).toBe(false);
    expect(isPublicHttpUrl('http://127.1.2.3/')).toBe(false);
    expect(isPublicHttpUrl('http://localhost/hook')).toBe(false);
    expect(isPublicHttpUrl('http://api.localhost/hook')).toBe(false);
    expect(isPublicHttpUrl('http://[::1]/hook')).toBe(false);
  });

  it('refuses cloud metadata and link-local addresses', () => {
    expect(isPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isPublicHttpUrl('http://[fe80::1]/hook')).toBe(false);
  });

  it('refuses RFC 1918 and carrier-grade NAT ranges', () => {
    expect(isPublicHttpUrl('http://10.0.0.5/hook')).toBe(false);
    expect(isPublicHttpUrl('http://172.16.0.9/hook')).toBe(false);
    expect(isPublicHttpUrl('http://172.31.255.255/hook')).toBe(false);
    expect(isPublicHttpUrl('http://192.168.1.10/hook')).toBe(false);
    expect(isPublicHttpUrl('http://100.64.0.1/hook')).toBe(false);
    expect(isPublicHttpUrl('http://[fd00::1]/hook')).toBe(false);
  });

  it('allows public addresses adjacent to private ranges', () => {
    expect(isPublicHttpUrl('http://172.15.0.1/hook')).toBe(true);
    expect(isPublicHttpUrl('http://172.32.0.1/hook')).toBe(true);
    expect(isPublicHttpUrl('http://192.169.1.1/hook')).toBe(true);
    expect(isPublicHttpUrl('http://11.0.0.1/hook')).toBe(true);
  });

  it('refuses multicast, 0.0.0.0 and .internal names', () => {
    expect(isPublicHttpUrl('http://0.0.0.0/hook')).toBe(false);
    expect(isPublicHttpUrl('http://224.0.0.1/hook')).toBe(false);
    expect(isPublicHttpUrl('http://metadata.internal/hook')).toBe(false);
  });

  it('still refuses non-http schemes', () => {
    expect(isPublicHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isPublicHttpUrl('file:///etc/passwd')).toBe(false);
  });
});

describe('assertSafeRedirectUrl', () => {
  it('returns the trimmed URL when safe', () => {
    expect(assertSafeRedirectUrl(' https://example.com/x ')).toBe('https://example.com/x');
  });

  it('throws for unsafe values', () => {
    expect(() => assertSafeRedirectUrl('javascript:alert(1)')).toThrow(BadRequestException);
    expect(() => assertSafeRedirectUrl('')).toThrow(BadRequestException);
  });
});
