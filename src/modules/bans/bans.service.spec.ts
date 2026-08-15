const decorator = () => () => undefined;

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

jest.mock('@entities/index', () => ({ Ban: class Ban {}, User: class User {} }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BansService, ipv4ToNum, ipInRange, isValidCidr, normalizeIp } from './bans.service';

describe('ipv4ToNum', () => {
  it('parses dotted quads', () => {
    expect(ipv4ToNum('0.0.0.0')).toBe(0);
    expect(ipv4ToNum('10.0.0.1')).toBe(167772161);
    expect(ipv4ToNum('255.255.255.255')).toBe(4294967295);
  });

  it('strips the IPv4-mapped IPv6 prefix', () => {
    expect(ipv4ToNum('::ffff:10.0.0.1')).toBe(ipv4ToNum('10.0.0.1'));
  });

  it('rejects anything that is not a dotted quad', () => {
    // Previously each octet went through parseInt with no validation, so IPv6
    // addresses silently became NaN — and `NaN & mask` is 0.
    expect(ipv4ToNum('::1')).toBeNull();
    expect(ipv4ToNum('2001:db8::1')).toBeNull();
    expect(ipv4ToNum('10.0.0')).toBeNull();
    expect(ipv4ToNum('10.0.0.256')).toBeNull();
    expect(ipv4ToNum('10.0.0.a')).toBeNull();
    expect(ipv4ToNum('')).toBeNull();
  });
});

describe('IPv6 normalization and CIDR matching', () => {
  it('canonicalizes equivalent IPv6 forms', () => {
    expect(normalizeIp('2001:db8::1')).toBe(normalizeIp('2001:0db8:0:0:0:0:0:1'));
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('validates and matches IPv6 CIDR blocks without matching IPv4', () => {
    expect(isValidCidr('2001:db8::/32')).toBe(true);
    expect(isValidCidr('2001:db8::/129')).toBe(false);
    expect(ipInRange('2001:db8:1::42', '2001:db8::/32')).toBe(true);
    expect(ipInRange('2001:db9::1', '2001:db8::/32')).toBe(false);
    expect(ipInRange('203.0.113.7', '2001:db8::/32')).toBe(false);
  });
});

describe('ipInRange', () => {
  it('matches addresses inside the block', () => {
    expect(ipInRange('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(ipInRange('192.168.1.55', '192.168.1.0/24')).toBe(true);
    expect(ipInRange('203.0.113.7', '203.0.113.7/32')).toBe(true);
  });

  it('rejects addresses outside the block', () => {
    expect(ipInRange('11.1.2.3', '10.0.0.0/8')).toBe(false);
    expect(ipInRange('192.168.2.55', '192.168.1.0/24')).toBe(false);
    expect(ipInRange('203.0.113.8', '203.0.113.7/32')).toBe(false);
  });

  it('treats /0 as matching every IPv4 address', () => {
    expect(ipInRange('1.2.3.4', '0.0.0.0/0')).toBe(true);
  });

  it('rejects a value with no prefix instead of silently exact-matching', () => {
    // The old implementation produced a mask of -1 here, which degraded into an
    // exact comparison — a stored "10.0.0.1" range quietly matched only itself.
    expect(ipInRange('10.0.0.1', '10.0.0.1')).toBe(false);
    expect(ipInRange('1.2.3.4', '10.0.0.1')).toBe(false);
  });

  it('rejects malformed prefixes', () => {
    expect(ipInRange('10.0.0.1', '10.0.0.0/33')).toBe(false);
    expect(ipInRange('10.0.0.1', '10.0.0.0/abc')).toBe(false);
    expect(ipInRange('10.0.0.1', '10.0.0.0/')).toBe(false);
  });

  it('does not match IPv6 clients against IPv4 ranges', () => {
    // Regression: ipToNum('::1') was NaN, NaN & mask === 0, so this returned true
    // for any range whose network address also computed to 0.
    expect(ipInRange('::1', '0.0.0.0/8')).toBe(false);
    expect(ipInRange('::1', '10.0.0.0/8')).toBe(false);
    expect(ipInRange('2001:db8::1', '0.0.0.0/0')).toBe(false);
  });
});

describe('isValidCidr', () => {
  it('accepts well-formed blocks', () => {
    expect(isValidCidr('203.0.113.0/24')).toBe(true);
    expect(isValidCidr('0.0.0.0/0')).toBe(true);
  });

  it('rejects malformed blocks', () => {
    expect(isValidCidr('203.0.113.0')).toBe(false);
    expect(isValidCidr('203.0.113.0/33')).toBe(false);
    expect(isValidCidr('not-an-ip/24')).toBe(false);
    expect(isValidCidr('')).toBe(false);
  });
});

describe('normalizeIp', () => {
  it('strips the IPv4-mapped prefix and trims', () => {
    expect(normalizeIp('::ffff:203.0.113.5')).toBe('203.0.113.5');
    expect(normalizeIp('  10.0.0.1 ')).toBe('10.0.0.1');
    expect(normalizeIp('::1')).toBe('::1');
  });
});

function createService(bans: any[]) {
  const find = jest.fn().mockResolvedValue(bans);
  const banRepository = {
    find,
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 1, ...v })),
  };
  const service = new BansService(banRepository as any, { findOne: jest.fn() } as any);
  return { service, find, banRepository };
}

describe('BansService cache', () => {
  it('finds a ban on the very first check', async () => {
    // Regression: the refresh was fire-and-forget behind a synchronous wrapper, so
    // the first call always read an empty map and reported "not banned".
    const { service } = createService([
      { ban_type: 'user', value: '42', reason: 'spam' },
    ]);

    await expect(service.isActive('user', 42)).resolves.toBe(true);
  });

  it('reports unrelated values as not banned', async () => {
    const { service } = createService([{ ban_type: 'user', value: '42', reason: null }]);

    await expect(service.isActive('user', 7)).resolves.toBe(false);
  });

  it('issues a single query for concurrent checks', async () => {
    const { service, find } = createService([{ ban_type: 'ip', value: '10.0.0.1', reason: null }]);

    await Promise.all([
      service.checkIp('10.0.0.1'),
      service.checkIp('10.0.0.2'),
      service.checkIp('10.0.0.3'),
    ]);

    expect(find).toHaveBeenCalledTimes(1);
  });

  it('matches an IPv4-mapped client address against a stored IPv4 ban', async () => {
    const { service } = createService([{ ban_type: 'ip', value: '203.0.113.5', reason: null }]);

    await expect(service.checkIp('::ffff:203.0.113.5')).resolves.toBe(true);
  });

  it('matches CIDR range bans', async () => {
    const { service } = createService([
      { ban_type: 'ip_range', value: '203.0.113.0/24', reason: null },
    ]);

    await expect(service.checkIp('203.0.113.99')).resolves.toBe(true);
    await expect(service.checkIp('203.0.114.99')).resolves.toBe(false);
  });

  it('does not lock out every client because of one malformed range', async () => {
    const { service } = createService([
      { ban_type: 'ip_range', value: 'garbage', reason: null },
    ]);

    await expect(service.checkIp('1.2.3.4')).resolves.toBe(false);
    await expect(service.checkIp('::1')).resolves.toBe(false);
  });

  it('keeps serving the previous cache when the query fails', async () => {
    const { service, find } = createService([{ ban_type: 'user', value: '42', reason: null }]);
    await service.isActive('user', 42);

    find.mockRejectedValueOnce(new Error('db down'));
    (service as any).cacheExpiry = 0; // force a refresh attempt

    // Still reports the ban rather than failing open.
    await expect(service.isActive('user', 42)).resolves.toBe(true);
  });
});

describe('BansService.assertUserNotBanned', () => {
  it('throws for a banned user', async () => {
    const { service } = createService([{ ban_type: 'user', value: '42', reason: 'spam' }]);

    await expect(service.assertUserNotBanned(42)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes for an unbanned user', async () => {
    const { service } = createService([]);

    await expect(service.assertUserNotBanned(42)).resolves.toBeUndefined();
  });
});

describe('BansService.create validation', () => {
  it('rejects an invalid ban type', async () => {
    const { service } = createService([]);

    await expect(
      service.create({ ban_type: 'nonsense', value: 'x', created_by: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an IP ban that is not a valid IPv4 address', async () => {
    const { service } = createService([]);

    await expect(
      service.create({ ban_type: 'ip', value: 'not-an-ip', created_by: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a range ban with no CIDR prefix', async () => {
    const { service } = createService([]);

    // Storing this used to succeed and then never match anything meaningful.
    await expect(
      service.create({ ban_type: 'ip_range', value: '203.0.113.0', created_by: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts well-formed bans', async () => {
    const { service, banRepository } = createService([]);

    await service.create({ ban_type: 'ip', value: '203.0.113.5', created_by: 1 });
    await service.create({ ban_type: 'ip_range', value: '203.0.113.0/24', created_by: 1 });
    await service.create({ ban_type: 'user', value: '42', created_by: 1 });

    expect(banRepository.save).toHaveBeenCalledTimes(3);
  });
});
