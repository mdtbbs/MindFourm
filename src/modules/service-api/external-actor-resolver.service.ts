import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@entities/user.entity';
import { BansService } from '../bans/bans.service';
import { ExternalApiKeyContext, hasExternalScope } from './external-api-scopes';

export interface ExternalActorSelector {
  user_id?: number;
  mindauth_id?: number;
  username?: string;
}

@Injectable()
export class ExternalActorResolverService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private bansService: BansService,
  ) {}

  async resolveWritableActor(
    selector: ExternalActorSelector,
    apiKey: ExternalApiKeyContext,
  ): Promise<User> {
    const user = await this.resolveActor(selector, apiKey);
    await this.assertWritable(user, apiKey);
    return user;
  }

  async resolveActor(
    selector: ExternalActorSelector = {},
    apiKey: ExternalApiKeyContext,
  ): Promise<User> {
    const normalized = this.normalizeSelector(selector);
    const selectorCount = [
      normalized.user_id !== undefined,
      normalized.mindauth_id !== undefined,
      normalized.username !== undefined,
    ].filter(Boolean).length;

    if (selectorCount > 1) {
      throw new BadRequestException({
        code: 'EXTERNAL_API_VALIDATION_FAILED',
        message: 'user_id、mindauth_id、username 只能提供一个',
      });
    }

    if (selectorCount === 0) {
      if (!apiKey.default_user_id) {
        throw new BadRequestException({
          code: 'EXTERNAL_API_ACTOR_REQUIRED',
          message: '必须指定用户，或为 API Key 配置默认机器人账号',
        });
      }
      normalized.user_id = apiKey.default_user_id;
    } else if (!hasExternalScope(apiKey.scopes, 'users:impersonate')) {
      throw new ForbiddenException({
        code: 'EXTERNAL_API_IMPERSONATION_DENIED',
        message: '当前 API Key 没有代发用户权限',
      });
    }

    const user = await this.findUser(normalized);
    if (!user) {
      throw new NotFoundException({
        code: 'EXTERNAL_API_ACTOR_NOT_FOUND',
        message: '指定账号不存在',
      });
    }

    await this.bansService.assertUserNotBanned(user.id);
    return user;
  }

  async assertWritable(user: User, apiKey: ExternalApiKeyContext): Promise<void> {
    if (!user.phone_verified && !hasExternalScope(apiKey.scopes, 'users:bypass_phone_verification')) {
      throw new ForbiddenException({
        code: 'PHONE_NOT_VERIFIED',
        message: '指定账号未验证手机号，不能执行写操作',
      });
    }
  }

  private normalizeSelector(selector: ExternalActorSelector): ExternalActorSelector {
    return {
      user_id: selector.user_id === undefined ? undefined : Number(selector.user_id),
      mindauth_id: selector.mindauth_id === undefined ? undefined : Number(selector.mindauth_id),
      username: selector.username?.trim() || undefined,
    };
  }

  private async findUser(selector: ExternalActorSelector): Promise<User | null> {
    if (selector.user_id !== undefined) {
      return this.userRepository.findOne({ where: { id: selector.user_id } });
    }
    if (selector.mindauth_id !== undefined) {
      return this.userRepository.findOne({ where: { mindauth_id: selector.mindauth_id } });
    }
    if (selector.username !== undefined) {
      return this.userRepository.findOne({ where: { username: selector.username } });
    }
    return null;
  }
}
