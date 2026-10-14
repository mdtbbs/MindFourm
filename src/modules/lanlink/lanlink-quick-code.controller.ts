import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '@database/redis.service';
import { getClientIp } from '@common/utils/client-context.util';
import { AuthService } from '../auth/auth.service';
import { ExternalApiKeyGuard } from '@common/guards/external-api-key.guard';
import { ExternalScope } from '@common/decorators/external-scope.decorator';
import {
  ExternalLegacyFlag,
  ExternalStrictScope,
} from '@common/decorators/external-route-policy.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { LanLinkQuickCodeService } from './lanlink-quick-code.service';
import { ValidateLanLinkQuickCodeDto } from './dto/lanlink-quick-code.dto';

/**
 * The two external quick-code routes are compatibility surface for the legacy
 * LanLink control plane, not for third-party clients. They are gated by
 * `LANLINK_LEGACY_QUICK_CODE_ENABLED` (default off) and by a dedicated scope.
 */
const LEGACY_QUICK_CODE_SCOPE = 'lanlink:legacy_quick_code';
const LEGACY_QUICK_CODE_FLAG = {
  configPath: 'lanlink.legacyQuickCodeEnabled',
  code: 'LANLINK_LEGACY_QUICK_CODE_DISABLED',
  message: 'Legacy LanLink quick-code endpoint is disabled on this deployment',
} as const;

/**
 * Failed-code attempt budget, per dedicated key and client IP.
 *
 * Quick codes are 8-character secrets, so the legacy endpoint needs a guess
 * budget of its own on top of the key-level limiter. Only failed submissions
 * consume it — a legitimate flow that retries a typo, or logs in several
 * devices in a row, must not be locked out by its own success path.
 */
const FAILED_ATTEMPT_LIMIT = 20;
const FAILED_ATTEMPT_WINDOW_SECONDS = 600;

/**
 * Projection of the Forum user that the legacy LanLink control plane actually
 * consumes when it exchanges a quick code for its own session token:
 * `id`, `username`, `avatar_url`, `role`, `phone_verified` and `mindauth_id`
 * flow into the LanLink token payload (`sanitizeUser`) and its presence/room
 * authorization checks. `email` and `phone_verified_at` are not read by any
 * caller and stay out of the response.
 */
function toLegacyQuickCodeUser(user: {
  id: number;
  mindauth_id: number | null;
  username: string;
  avatar_url: string | null;
  role: string;
  phone_verified: boolean;
}) {
  return {
    id: user.id,
    mindauth_id: user.mindauth_id,
    username: user.username,
    avatar_url: user.avatar_url,
    role: user.role,
    phone_verified: user.phone_verified,
  };
}

@Controller('lanlink/quick-code')
export class LanLinkQuickCodeController {
  constructor(
    private authService: AuthService,
    private quickCodeService: LanLinkQuickCodeService,
  ) {}

  @Get()
  async status(@Req() req: any) {
    const user = await this.requireUser(req);
    const status = await this.quickCodeService.statusForUser(user.id);
    return {
      configured: !!status,
      status,
    };
  }

  @Post()
  async generate(@Req() req: any) {
    const user = await this.requireUser(req);
    const result = await this.quickCodeService.generateForUser(user.id);
    return {
      code: result.code,
      status: result.status,
      message: '请立即复制保存；之后只能重置，不能再次查看明文识别码。',
    };
  }

  @Delete()
  async disable(@Req() req: any) {
    const user = await this.requireUser(req);
    const status = await this.quickCodeService.disableForUser(user.id);
    return {
      configured: !!status,
      status,
    };
  }

  private async requireUser(req: any) {
    if (req.user) return req.user;
    const sessionToken = req.cookies?.forum_session || this.extractBearer(req);
    if (!sessionToken) throw new UnauthorizedException('未登录');
    const user = await this.authService.verifySession(sessionToken);
    if (!user) throw new UnauthorizedException('会话已过期');
    req.user = user;
    return user;
  }

  private extractBearer(req: any): string | undefined {
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

@Controller('external/v1/lanlink/quick-code')
@SkipPhoneVerification()
@UseGuards(ExternalApiKeyGuard)
export class ExternalLanLinkQuickCodeController {
  constructor(
    private quickCodeService: LanLinkQuickCodeService,
    private redisService: RedisService,
  ) {}

  @Post('validate')
  @ExternalScope(LEGACY_QUICK_CODE_SCOPE)
  // Deny override: an exact, narrowly issued scope is required and wildcard
  // grants are refused even though the general matcher would accept them.
  @ExternalStrictScope(LEGACY_QUICK_CODE_SCOPE)
  @ExternalLegacyFlag(LEGACY_QUICK_CODE_FLAG)
  async validate(@Body() body: ValidateLanLinkQuickCodeDto, @Req() req: any) {
    await this.assertAttemptBudget(req);

    const result = await this.quickCodeService.validate(body.code);
    if (!result.valid) {
      await this.recordFailedAttempt(req);
      return { valid: false };
    }

    const { user, code } = result;
    return {
      valid: true,
      user: toLegacyQuickCodeUser(user),
      code: {
        token_version: code.token_version,
      },
    };
  }

  @Get('users/:id')
  @ExternalScope(LEGACY_QUICK_CODE_SCOPE)
  @ExternalStrictScope(LEGACY_QUICK_CODE_SCOPE)
  @ExternalLegacyFlag(LEGACY_QUICK_CODE_FLAG)
  async userStatus(@Param('id', ParseIntPipe) id: number) {
    const user = await this.quickCodeService.getUserStatus(id);
    if (!user) throw new NotFoundException('用户不存在');
    return {
      user: toLegacyQuickCodeUser(user),
    };
  }

  /**
   * Refuse a submission whose failure budget is already exhausted. Counting
   * happens on failure only, so this read never consumes the budget itself.
   */
  private async assertAttemptBudget(req: any): Promise<void> {
    const current = Number((await this.redisService.get(this.attemptKey(req))) || 0);
    if (current >= FAILED_ATTEMPT_LIMIT) {
      throw new HttpException({
        code: 'LANLINK_QUICK_CODE_ATTEMPTS_EXCEEDED',
        message: 'Too many invalid quick-code submissions; retry later or reset the code',
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /**
   * Charge a failed submission to the shared limiter. Redis is a security
   * dependency on this route, so an unavailable counter refuses the response
   * instead of silently allowing unbounded guessing.
   */
  private async recordFailedAttempt(req: any): Promise<void> {
    try {
      await this.redisService.incrementFixedWindowStrict(
        this.attemptKey(req),
        FAILED_ATTEMPT_WINDOW_SECONDS,
      );
    } catch {
      throw new HttpException({
        code: 'SECURITY_DEPENDENCY_UNAVAILABLE',
        message: 'Authentication dependency unavailable; refusing to validate credentials',
      }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /** Hash the client IP so the counter key is not a raw-address log. */
  private attemptKey(req: any): string {
    const keyId = Number(req?.externalApiKey?.id);
    const clientIp = String(getClientIp(req) || 'unknown');
    const digest = createHash('sha256').update(clientIp).digest('hex').slice(0, 16);
    return `lanlink_quick_code_failed:${keyId}:${digest}`;
  }
}
