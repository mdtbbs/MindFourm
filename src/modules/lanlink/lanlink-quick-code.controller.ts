import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ExternalApiKeyGuard } from '@common/guards/external-api-key.guard';
import { ExternalScope } from '@common/decorators/external-scope.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { LanLinkQuickCodeService } from './lanlink-quick-code.service';
import { ValidateLanLinkQuickCodeDto } from './dto/lanlink-quick-code.dto';

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
  constructor(private quickCodeService: LanLinkQuickCodeService) {}

  @Post('validate')
  @ExternalScope('lanlink:auth')
  async validate(@Body() body: ValidateLanLinkQuickCodeDto) {
    const result = await this.quickCodeService.validate(body.code);
    if (!result.valid) return { valid: false };

    const { user, code } = result;
    return {
      valid: true,
      user: {
        id: user.id,
        mindauth_id: user.mindauth_id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        role: user.role,
        phone_verified: user.phone_verified,
        phone_verified_at: user.phone_verified_at,
      },
      code: {
        token_version: code.token_version,
        last_used_at: code.last_used_at,
        use_count: code.use_count,
      },
    };
  }

  @Get('users/:id')
  @ExternalScope('lanlink:auth')
  async userStatus(@Param('id', ParseIntPipe) id: number) {
    const user = await this.quickCodeService.getUserStatus(id);
    if (!user) throw new NotFoundException('用户不存在');
    return {
      user: {
        id: user.id,
        mindauth_id: user.mindauth_id,
        username: user.username,
        avatar_url: user.avatar_url,
        role: user.role,
        phone_verified: user.phone_verified,
        phone_verified_at: user.phone_verified_at,
      },
    };
  }
}
