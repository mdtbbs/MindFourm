import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { QQAuthService } from './qq-auth.service';
import { QQLoginDto } from './dto/qq-login.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { Public } from '@common/decorators/public.decorator';
import { SettingsService } from '@modules/settings/settings.service';

@Controller('qq-auth')
export class QQAuthController {
  constructor(
    private readonly qqAuthService: QQAuthService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * 检查 QQ 登录功能是否启用
   *
   * @returns 功能状态
   */
  @Get('status')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getQQLoginStatus() {
    const enabled = await this.settingsService.get('feature_qq_login_enabled');
    return {
      success: true,
      data: {
        enabled: enabled === 'true',
      },
    };
  }

  /**
   * 检查 QQ 登录功能是否启用（内部方法）
   *
   * @throws ForbiddenException 功能未启用时抛出
   */
  private async checkQQLoginEnabled(): Promise<void> {
    const enabled = await this.settingsService.get('feature_qq_login_enabled');
    if (enabled !== 'true') {
      throw new ForbiddenException('QQ 登录功能未启用');
    }
  }

  /**
   * 获取 QQ 授权 URL
   *
   * @param redirectUri 回调地址
   * @returns 授权 URL
   */
  @Get('authorize')
  @HttpCode(HttpStatus.OK)
  async getAuthorizeUrl(
    @Query('redirect_uri') redirectUri: string,
    @Query('bind') bind?: string,
  ) {
    await this.checkQQLoginEnabled();

    const state = this.qqAuthService.generateState();
    await this.qqAuthService.saveState(state, bind === 'true' ? 'bind' : 'login');

    const callbackUrl = process.env.QQ_CALLBACK_URL || redirectUri;
    const authorizeUrl = this.qqAuthService.generateAuthorizeUrl(callbackUrl, state);

    return {
      success: true,
      data: {
        authorize_url: authorizeUrl,
        state: state,
      },
    };
  }

  /**
   * QQ 授权回调（Web 端）
   *
   * @param code 授权码
   * @param state 状态参数
   * @param req 请求对象
   * @param res 响应对象
   */
  @Get('callback')
  async qqCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request & { user?: any },
    @Res() res: Response,
  ) {
    try {
      // 检查功能是否启用
      await this.checkQQLoginEnabled();

      // 消费 state，并识别登录/绑定模式
      const stateMode = await this.qqAuthService.consumeState(state);

      // 获取回调 URL
      const callbackUrl = process.env.QQ_CALLBACK_URL || `${process.env.FRONTEND_URL}/qq-callback`;

      // 使用 code 换取 access_token
      const accessToken = await this.qqAuthService.getAccessToken(code, callbackUrl);

      // 获取 openid
      const { openId, unionId } = await this.qqAuthService.getOpenId(accessToken);

      // 获取用户信息
      const qqUserInfo = await this.qqAuthService.getUserInfo(accessToken, openId);

      // 查找或创建用户
      const { user, isNew } = await this.qqAuthService.getOrCreateUser(qqUserInfo, openId, unionId);

      // 生成 session token
      const sessionToken = this.qqAuthService.generateDeviceToken();

      // 创建 session
      const ip = req.ip || '127.0.0.1';
      await this.qqAuthService.createSession(user.id, sessionToken, ip);

      // 记录登录日志
      await this.qqAuthService.recordLoginLog(
        user.id,
        'qq',
        'web',
        '',
        ip,
        req.headers['user-agent'] || '',
      );

      // 取消待处理的注销申请
      await this.qqAuthService.cancelPendingDeletion(user.id);

      // 设置 cookie
      res.cookie('forum_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // 重定向到首页
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}?login=success${isNew ? '&new=1' : ''}`);
    } catch (error) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}?login=failed&error=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * 使用授权码登录（App 端或 AJAX）
   *
   * @param dto 登录数据
   * @param req 请求对象
   * @returns 用户信息和 token
   */
  @Post('login-with-code')
  @RateLimit({ max: 10, window: 60 }) // 每分钟最多10次
  @HttpCode(HttpStatus.OK)
  async loginWithCode(@Body() dto: QQLoginDto, @Req() req: Request) {
    try {
      // 检查功能是否启用
      await this.checkQQLoginEnabled();

      // 验证 state（如果提供）
      if (dto.state) {
        await this.qqAuthService.validateState(dto.state);
      }

      // 获取回调 URL
      const callbackUrl = process.env.QQ_CALLBACK_URL || `${process.env.FRONTEND_URL}/qq-callback`;

      // 使用 code 换取 access_token
      const accessToken = await this.qqAuthService.getAccessToken(dto.code, callbackUrl);

      // 获取 openid
      const { openId, unionId } = await this.qqAuthService.getOpenId(accessToken);

      // 获取用户信息
      const qqUserInfo = await this.qqAuthService.getUserInfo(accessToken, openId);

      // 查找或创建用户
      const { user, isNew } = await this.qqAuthService.getOrCreateUser(qqUserInfo, openId, unionId);

      // 生成 session token
      const sessionToken = this.qqAuthService.generateDeviceToken();

      // 创建 session
      const ip = req.ip || '127.0.0.1';
      await this.qqAuthService.createSession(user.id, sessionToken, ip);

      // 保存设备信息
      const deviceToken = this.qqAuthService.generateDeviceToken();
      await this.qqAuthService.saveDeviceToken(
        user.id,
        deviceToken,
        ip,
        {
          userAgent: req.headers['user-agent'],
        },
        'web',
      );

      // 记录登录日志
      await this.qqAuthService.recordLoginLog(
        user.id,
        'qq',
        'web',
        dto.device_id || '',
        ip,
        req.headers['user-agent'] || '',
      );

      // 取消待处理的注销申请
      await this.qqAuthService.cancelPendingDeletion(user.id);

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            avatar_url: user.avatar_url,
            role: user.role,
            is_new: isNew,
          },
          token: sessionToken,
          device_token: deviceToken,
          expires_in: 7 * 24 * 60 * 60, // 7 days
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 解绑 QQ 账号
   *
   * @param req 请求对象
   */
  @Post('unbind')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async unbindQQ(@Req() req: any) {
    const userId = req.user.id;
    await this.qqAuthService.unbindQQ(userId);

    return {
      success: true,
      message: 'QQ 账号已解绑',
    };
  }
}
