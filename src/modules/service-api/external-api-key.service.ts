import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalApiKey } from '@entities/external-api-key.entity';
import { secretsMatch } from '@common/utils/secret-compare.util';
import {
  generateExternalApiKey,
  hashExternalApiKey,
  extractExternalApiKeyPrefix,
} from './external-api-key.util';
import { ExternalApiKeyContext, uniqueScopes } from './external-api-scopes';

export interface CreateExternalApiKeyInput {
  name: string;
  scopes: string[];
  allowed_ips?: string[];
  default_user_id?: number | null;
  rate_limit_per_minute?: number;
  expires_at?: Date | string | null;
  created_by?: number | null;
}

export interface UpdateExternalApiKeyInput {
  name?: string;
  scopes?: string[];
  allowed_ips?: string[] | null;
  default_user_id?: number | null;
  rate_limit_per_minute?: number;
  enabled?: boolean;
  expires_at?: Date | string | null;
}

export interface ExternalApiKeyWithSecret {
  key: ExternalApiKey;
  plainKey: string;
}

@Injectable()
export class ExternalApiKeyService {
  constructor(
    @InjectRepository(ExternalApiKey)
    private externalApiKeyRepository: Repository<ExternalApiKey>,
  ) {}

  async create(input: CreateExternalApiKeyInput): Promise<ExternalApiKeyWithSecret> {
    if (!input.name.trim()) {
      throw new BadRequestException('name is required');
    }
    if (!uniqueScopes(input.scopes).length) {
      throw new BadRequestException('at least one scope is required');
    }

    const generated = generateExternalApiKey();
    const key = this.externalApiKeyRepository.create({
      name: input.name.trim(),
      key_prefix: generated.keyPrefix,
      key_hash: generated.keyHash,
      scopes_json: JSON.stringify(uniqueScopes(input.scopes)),
      allowed_ips_json: this.stringifyList(input.allowed_ips),
      default_user_id: input.default_user_id ?? null,
      rate_limit_per_minute: this.normalizeRateLimit(input.rate_limit_per_minute),
      enabled: true,
      expires_at: this.normalizeDate(input.expires_at),
      created_by: input.created_by ?? null,
    });

    return {
      key: await this.externalApiKeyRepository.save(key),
      plainKey: generated.plainKey,
    };
  }

  async list(params: { page?: number; limit?: number; enabled?: boolean } = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const where = params.enabled === undefined ? {} : { enabled: params.enabled };
    const [items, total] = await this.externalApiKeyRepository.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((item) => this.toSafeView(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: number): Promise<ExternalApiKey> {
    const key = await this.externalApiKeyRepository.findOne({ where: { id } });
    if (!key) {
      throw new NotFoundException('API key not found');
    }
    return key;
  }

  async update(id: number, input: UpdateExternalApiKeyInput): Promise<ExternalApiKey> {
    const key = await this.getById(id);
    if (input.name !== undefined) {
      if (!input.name.trim()) {
        throw new BadRequestException('name is required');
      }
      key.name = input.name.trim();
    }
    if (input.scopes !== undefined) {
      if (!uniqueScopes(input.scopes).length) {
        throw new BadRequestException('at least one scope is required');
      }
      key.scopes_json = JSON.stringify(uniqueScopes(input.scopes));
    }
    if (input.allowed_ips !== undefined) key.allowed_ips_json = this.stringifyList(input.allowed_ips ?? []);
    if (input.default_user_id !== undefined) key.default_user_id = input.default_user_id;
    if (input.rate_limit_per_minute !== undefined) key.rate_limit_per_minute = this.normalizeRateLimit(input.rate_limit_per_minute);
    if (input.enabled !== undefined) key.enabled = input.enabled;
    if (input.expires_at !== undefined) key.expires_at = this.normalizeDate(input.expires_at);
    return this.externalApiKeyRepository.save(key);
  }

  async rotate(id: number): Promise<ExternalApiKeyWithSecret> {
    const key = await this.getById(id);
    const generated = generateExternalApiKey();
    key.key_prefix = generated.keyPrefix;
    key.key_hash = generated.keyHash;
    key.last_used_at = null;
    return {
      key: await this.externalApiKeyRepository.save(key),
      plainKey: generated.plainKey,
    };
  }

  async setEnabled(id: number, enabled: boolean): Promise<ExternalApiKey> {
    const key = await this.getById(id);
    key.enabled = enabled;
    return this.externalApiKeyRepository.save(key);
  }

  async authenticate(plainKey: string): Promise<ExternalApiKey | null> {
    const keyPrefix = extractExternalApiKeyPrefix(plainKey);
    if (!keyPrefix) {
      return null;
    }

    const key = await this.externalApiKeyRepository.findOne({ where: { key_prefix: keyPrefix } });
    if (!key) {
      return null;
    }

    const providedHash = hashExternalApiKey(plainKey);
    if (!secretsMatch(providedHash, key.key_hash)) {
      return null;
    }

    return key;
  }

  async touchLastUsed(id: number): Promise<void> {
    await this.externalApiKeyRepository.update(id, { last_used_at: new Date() });
  }

  toContext(key: ExternalApiKey): ExternalApiKeyContext {
    return {
      id: key.id,
      name: key.name,
      key_prefix: key.key_prefix,
      scopes: this.parseList(key.scopes_json),
      allowed_ips: this.parseList(key.allowed_ips_json),
      default_user_id: key.default_user_id ?? null,
      rate_limit_per_minute: key.rate_limit_per_minute,
    };
  }

  toSafeView(key: ExternalApiKey) {
    return {
      id: key.id,
      name: key.name,
      key_prefix: key.key_prefix,
      scopes: this.parseList(key.scopes_json),
      allowed_ips: this.parseList(key.allowed_ips_json),
      default_user_id: key.default_user_id,
      rate_limit_per_minute: key.rate_limit_per_minute,
      enabled: key.enabled,
      expires_at: key.expires_at,
      last_used_at: key.last_used_at,
      created_by: key.created_by,
      created_at: key.created_at,
      updated_at: key.updated_at,
    };
  }

  parseList(value: string | null | undefined): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map((item) => String(item).trim()).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  private stringifyList(value: string[] | undefined | null): string | null {
    const list = uniqueScopes(value ?? []);
    return list.length ? JSON.stringify(list) : null;
  }

  private normalizeRateLimit(value: number | undefined): number {
    if (value === undefined) return 120;
    if (!Number.isFinite(Number(value)) || Number(value) < 1 || Number(value) > 10000) {
      throw new BadRequestException('rate_limit_per_minute must be between 1 and 10000');
    }
    return Math.floor(Number(value));
  }

  private normalizeDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('expires_at must be a valid date');
    }
    return date;
  }
}
