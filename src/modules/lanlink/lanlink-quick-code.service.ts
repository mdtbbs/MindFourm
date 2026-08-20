import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, createHash } from 'crypto';
import { Repository } from 'typeorm';
import { LanLinkQuickCode } from '@entities/lanlink-quick-code.entity';
import { User } from '@entities/user.entity';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PREFIX = 'LL';
const CODE_LENGTH = 8;

export interface LanLinkQuickCodeStatus {
  enabled: boolean;
  code_prefix: string;
  token_version: number;
  created_at: Date;
  rotated_at: Date | null;
  last_used_at: Date | null;
  use_count: number;
}

export interface LanLinkQuickCodeWithRaw {
  code: string;
  status: LanLinkQuickCodeStatus;
}

@Injectable()
export class LanLinkQuickCodeService {
  constructor(
    @InjectRepository(LanLinkQuickCode)
    private codeRepository: Repository<LanLinkQuickCode>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getUserStatus(userId: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId },
      select: {
        id: true,
        mindauth_id: true,
        username: true,
        avatar_url: true,
        role: true,
        phone_verified: true,
        phone_verified_at: true,
      },
    });
  }

  async statusForUser(userId: number): Promise<LanLinkQuickCodeStatus | null> {
    const record = await this.codeRepository.findOne({ where: { user_id: userId } });
    return record ? this.toStatus(record) : null;
  }

  async generateForUser(userId: number): Promise<LanLinkQuickCodeWithRaw> {
    const existing = await this.codeRepository.findOne({ where: { user_id: userId } });
    const rawCode = await this.generateUniqueCode();
    const now = new Date();

    const record = existing || this.codeRepository.create({
      user_id: userId,
      token_version: 0,
      use_count: 0,
    });

    record.code_prefix = this.prefixFor(rawCode);
    record.code_hash = this.hashCode(rawCode);
    record.enabled = true;
    record.token_version = (record.token_version || 0) + 1;
    record.rotated_at = existing ? now : null;
    record.last_used_at = null;
    record.use_count = 0;

    const saved = await this.codeRepository.save(record);
    return { code: rawCode, status: this.toStatus(saved) };
  }

  async disableForUser(userId: number): Promise<LanLinkQuickCodeStatus | null> {
    const record = await this.codeRepository.findOne({ where: { user_id: userId } });
    if (!record) return null;
    record.enabled = false;
    const saved = await this.codeRepository.save(record);
    return this.toStatus(saved);
  }

  async validate(rawCode: string): Promise<{ valid: false } | { valid: true; user: User; code: LanLinkQuickCodeStatus }> {
    const normalized = this.normalizeCode(rawCode);
    if (!normalized) return { valid: false };

    const record = await this.codeRepository.findOne({
      where: { code_hash: this.hashCode(normalized), enabled: true },
      relations: ['user'],
    });
    if (!record || !record.user) return { valid: false };

    record.last_used_at = new Date();
    record.use_count = (record.use_count || 0) + 1;
    const saved = await this.codeRepository.save(record);

    return { valid: true, user: saved.user, code: this.toStatus(saved) };
  }

  normalizeCode(value: string): string {
    const text = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!text.startsWith(CODE_PREFIX) || text.length !== CODE_PREFIX.length + CODE_LENGTH) return '';
    return `${CODE_PREFIX}-${text.slice(2, 6)}-${text.slice(6)}`;
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const raw = this.randomCode();
      const exists = await this.codeRepository.exist({ where: { code_hash: this.hashCode(raw) } });
      if (!exists) return raw;
    }
    throw new Error('生成 LanLink 识别码失败，请重试');
  }

  private randomCode(): string {
    let out = '';
    const bytes = randomBytes(CODE_LENGTH);
    for (let i = 0; i < CODE_LENGTH; i++) {
      out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return `${CODE_PREFIX}-${out.slice(0, 4)}-${out.slice(4)}`;
  }

  private hashCode(value: string): string {
    return createHash('sha256').update(this.normalizeCode(value)).digest('hex');
  }

  private prefixFor(value: string): string {
    return this.normalizeCode(value).slice(0, 7);
  }

  private toStatus(record: LanLinkQuickCode): LanLinkQuickCodeStatus {
    return {
      enabled: record.enabled,
      code_prefix: record.code_prefix,
      token_version: record.token_version,
      created_at: record.created_at,
      rotated_at: record.rotated_at,
      last_used_at: record.last_used_at,
      use_count: record.use_count,
    };
  }
}
