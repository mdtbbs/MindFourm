import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ban, User } from '@entities/index';

interface BanCacheEntry {
  ban_type: string;
  value: string;
  reason: string | null;
}

/**
 * Strip the IPv4-mapped IPv6 prefix so `::ffff:203.0.113.5` compares equal to
 * `203.0.113.5`.
 */
export function normalizeIp(ip: string): string {
  return (ip || '').trim().replace(/^::ffff:/i, '');
}

/**
 * Parse a dotted-quad IPv4 address into a 32-bit number, or null if it is not one.
 *
 * The previous version used `parseInt` per octet without validating, so an IPv6
 * address produced NaN. `NaN & mask` is 0, which made every IPv6 client match any
 * range whose network address also computed to 0 (`0.0.0.0/8`, for instance).
 */
export function ipv4ToNum(ip: string): number | null {
  const octets = normalizeIp(ip).split('.');
  if (octets.length !== 4) {
    return null;
  }

  let result = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) {
      return null;
    }
    const value = Number(octet);
    if (value > 255) {
      return null;
    }
    result = result * 256 + value;
  }
  return result;
}

/** Whether a string is a well-formed IPv4 CIDR block. */
export function isValidCidr(cidr: string): boolean {
  const [range, bits] = (cidr || '').split('/');
  if (bits === undefined || !/^\d{1,2}$/.test(bits) || Number(bits) > 32) {
    return false;
  }
  return ipv4ToNum(range) !== null;
}

/**
 * Whether an IPv4 address falls inside a CIDR block.
 *
 * Returns false for anything malformed rather than guessing: a value with no `/`
 * suffix used to yield a mask of -1 and silently degrade into an exact-match
 * comparison, and IPv6 input matched unrelated ranges (see {@link ipv4ToNum}).
 */
export function ipInRange(ip: string, cidr: string): boolean {
  const [range, bits] = (cidr || '').split('/');
  if (bits === undefined || !/^\d{1,2}$/.test(bits)) {
    return false;
  }

  const prefix = Number(bits);
  if (prefix > 32) {
    return false;
  }

  const ipNum = ipv4ToNum(ip);
  const rangeNum = ipv4ToNum(range);
  if (ipNum === null || rangeNum === null) {
    return false;
  }

  // A /0 block covers everything; shifting by 32 is undefined in JS bitwise ops.
  if (prefix === 0) {
    return true;
  }

  const mask = (-1 << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

@Injectable()
export class BansService {
  private readonly logger = new Logger(BansService.name);
  private banCache: Map<string, BanCacheEntry> = new Map();
  private cacheExpiry: number = 0;
  private refreshInFlight: Promise<void> | null = null;
  private readonly CACHE_TTL = 10000; // 10 seconds in milliseconds

  constructor(
    @InjectRepository(Ban)
    private banRepository: Repository<Ban>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Create a new ban
   */
  async create(dto: {
    ban_type: string;
    value: string;
    reason?: string;
    created_by: number;
  }): Promise<Ban> {
    // Validate ban type
    if (!['user', 'ip', 'ip_range'].includes(dto.ban_type)) {
      throw new BadRequestException('Invalid ban type');
    }

    // Reject unusable values up front — a malformed range would otherwise be stored
    // and then silently never match.
    if (dto.ban_type === 'ip' && ipv4ToNum(dto.value) === null) {
      throw new BadRequestException('IP 封禁需要有效的 IPv4 地址');
    }
    if (dto.ban_type === 'ip_range' && !isValidCidr(dto.value)) {
      throw new BadRequestException('IP 段封禁需要有效的 CIDR，例如 203.0.113.0/24');
    }

    const ban = this.banRepository.create({
      ban_type: dto.ban_type,
      value: dto.value,
      reason: dto.reason,
      is_active: 1,
      created_by: dto.created_by,
    });

    const saved = await this.banRepository.save(ban);

    // Invalidate cache
    this.invalidateBanCache();

    return saved;
  }

  /**
   * Get paginated ban list with creator username
   */
  async getList(params: {
    page: number;
    limit: number;
    ban_type?: string;
    is_active?: number;
  }): Promise<{
    data: Ban[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, ban_type, is_active } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (ban_type) where.ban_type = ban_type;
    if (is_active !== undefined) where.is_active = is_active;

    const [data, total] = await this.banRepository.findAndCount({
      where,
      relations: ['creator'],
      select: {
        id: true,
        ban_type: true,
        value: true,
        reason: true,
        is_active: true,
        created_at: true,
        creator: {
          id: true,
          username: true,
        },
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Get ban by ID
   */
  async getById(id: number): Promise<Ban> {
    const ban = await this.banRepository.findOne({
      where: { id },
      relations: ['creator'],
    });

    if (!ban) {
      throw new BadRequestException('Ban not found');
    }

    return ban;
  }

  /**
   * Update ban (reason or is_active)
   */
  async update(id: number, updates: { reason?: string; is_active?: number }): Promise<Ban> {
    const ban = await this.getById(id);

    if (updates.reason !== undefined) {
      ban.reason = updates.reason;
    }
    if (updates.is_active !== undefined) {
      ban.is_active = updates.is_active;
    }

    const updated = await this.banRepository.save(ban);

    // Invalidate cache
    this.invalidateBanCache();

    return updated;
  }

  /**
   * Deactivate a ban
   */
  async deactivate(id: number): Promise<void> {
    await this.update(id, { is_active: 0 });
  }

  /**
   * Check if a ban is active (with in-memory cache)
   */
  async isActive(type: string, value: string | number): Promise<boolean> {
    await this.maybeRefreshCache();

    const cacheKey = `${type}:${value}`;
    return this.banCache.has(cacheKey);
  }

  /**
   * Throw if the user is banned.
   *
   * Called from the session-resolution path so that every authenticated request is
   * covered — a global guard cannot do it, because `req.user` is only populated by
   * the controller-scoped auth guard that runs afterwards.
   */
  async assertUserNotBanned(userId: number): Promise<void> {
    if (await this.isActive('user', userId)) {
      throw new ForbiddenException('您的账号已被封禁');
    }
  }

  /**
   * Check IP ban including CIDR range matching
   */
  async checkIp(ip: string): Promise<boolean> {
    await this.maybeRefreshCache();

    const normalized = normalizeIp(ip);

    // Check exact IP match, against both the raw and IPv4-mapped forms.
    if (this.banCache.has(`ip:${ip}`) || this.banCache.has(`ip:${normalized}`)) {
      return true;
    }

    // Check IP range matches
    for (const entry of this.banCache.values()) {
      if (entry.ban_type === 'ip_range' && ipInRange(normalized, entry.value)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Refresh the cache when the TTL has expired.
   *
   * Awaited, and concurrent callers share one in-flight query. Previously this was
   * synchronous and kicked off a fire-and-forget refresh, so callers read the stale
   * (on first use, empty) map and every ban check returned false.
   */
  private async maybeRefreshCache(): Promise<void> {
    if (Date.now() <= this.cacheExpiry) {
      return;
    }

    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshBanCache().finally(() => {
        this.refreshInFlight = null;
      });
    }

    await this.refreshInFlight;
  }

  /**
   * Load all active bans into memory
   */
  private async refreshBanCache(): Promise<void> {
    try {
      const bans = await this.banRepository.find({ where: { is_active: 1 } });

      this.banCache.clear();
      for (const ban of bans) {
        const cacheKey = `${ban.ban_type}:${ban.value}`;
        this.banCache.set(cacheKey, {
          ban_type: ban.ban_type,
          value: ban.value,
          reason: ban.reason,
        });
      }
      this.cacheExpiry = Date.now() + this.CACHE_TTL;
    } catch (err) {
      // Keep whatever is cached and retry on the next check rather than treating
      // a transient database error as "nothing is banned" forever.
      this.logger.error(`Failed to refresh ban cache: ${(err as Error).message}`);
    }
  }

  /**
   * Invalidate ban cache
   */
  private invalidateBanCache(): void {
    this.cacheExpiry = 0; // Force refresh on next check
  }
}
