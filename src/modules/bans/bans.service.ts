import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ban, User } from '@entities/index';

interface BanCacheEntry {
  ban_type: string;
  value: string;
  reason: string | null;
}

@Injectable()
export class BansService {
  private banCache: Map<string, BanCacheEntry> = new Map();
  private cacheExpiry: number = 0;
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
    // Refresh cache if expired
    this.maybeRefreshCache();

    const cacheKey = `${type}:${value}`;
    return this.banCache.has(cacheKey);
  }

  /**
   * Check IP ban including CIDR range matching
   */
  async checkIp(ip: string): Promise<boolean> {
    // Refresh cache if expired
    this.maybeRefreshCache();

    // Check exact IP match
    if (this.banCache.has(`ip:${ip}`)) {
      return true;
    }

    // Check IP range matches
    for (const [key, entry] of this.banCache.entries()) {
      if (entry.ban_type === 'ip_range' && key.startsWith('ip_range:')) {
        if (this.ipInRange(ip, entry.value)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Convert IP to numeric value
   */
  ipToNum(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
  }

  /**
   * Check if IP is within CIDR range
   */
  ipInRange(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
    return (this.ipToNum(ip) & mask) === (this.ipToNum(range) & mask);
  }

  /**
   * Refresh ban cache if TTL has expired
   */
  private maybeRefreshCache(): void {
    const now = Date.now();
    if (now > this.cacheExpiry) {
      this.refreshBanCache();
    }
  }

  /**
   * Load all active bans into memory
   */
  private refreshBanCache(): void {
    this.banRepository.find({
      where: { is_active: 1 },
    }).then((bans) => {
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
    }).catch((err) => {
      console.error('Failed to refresh ban cache:', err);
    });
  }

  /**
   * Invalidate ban cache
   */
  private invalidateBanCache(): void {
    this.cacheExpiry = 0; // Force refresh on next check
  }
}
