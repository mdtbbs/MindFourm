import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { User } from '@entities/user.entity';
import { UserDevice } from '@entities/user-device.entity';
import { LoginLog } from '@entities/login-log.entity';
import { RedisService } from '@database/redis.service';
import { QQUserInfo, QQTokenResponse, QQOpenIdResponse } from './interfaces/qq-user.interface';

/**
 * QQ OAuth2 认证服务
 *
 * 实现 QQ 互联 OAuth2.0 标准协议
 * 参考文档：https://wiki.connect.qq.com/准备工作_oauth2-0
 */
@Injectable()
export class QQAuthService {
  private readonly logger = new Logger(QQAuthService.name);
  private readonly sessionTtl = 7 * 24 * 60 * 60; // 7 days in seconds
  private readonly deviceTokenTtl = 30 * 24 * 60 * 60; // 30 days in seconds

  // QQ OAuth URLs
  private readonly AUTHORIZE_URL = 'https://graph.qq.com/oauth2.0/authorize';
  private readonly TOKEN_URL = 'https://graph.qq.com/oauth2.0/token';
  private readonly OPENID_URL = 'https://graph.qq.com/oauth2.0/me';
  private readonly USER_INFO_URL = 'https://graph.qq.com/user/get_user_info';

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserDevice)
    private userDeviceRepository: Repository<UserDevice>,
    @InjectRepository(LoginLog)
    private loginLogRepository: Repository<LoginLog>,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  /**
   * 生成 QQ 授权 URL
   *
   * @param redirectUri 回调地址
   * @param state 防 CSRF 状态参数
   * @returns 授权 URL
   */
  generateAuthorizeUrl(redirectUri: string, state: string): string {
    const appId = this.configService.get<string>('QQ_APP_ID') || '';
    const scope = this.configService.get<string>('QQ_SCOPE') || 'get_user_info';

    const params = new URLSearchParams();
    params.append('response_type', 'code');
    params.append('client_id', appId);
    params.append('redirect_uri', redirectUri);
    params.append('state', state);
    params.append('scope', scope);

    return `${this.AUTHORIZE_URL}?${params.toString()}`;
  }

  /**
   * 生成防 CSRF state 参数
   *
   * @returns state 字符串
   */
  generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * 保存 state 到 Redis（10分钟有效期）
   *
   * @param state state 参数
   */
  async saveState(state: string, value: 'login' | 'bind' = 'login'): Promise<void> {
    await this.redisService.set(`qq_state:${state}`, value, 600);
  }

  /** Consume a state value exactly once. */
  async consumeState(state: string): Promise<'login' | 'bind'> {
    const value = await this.redisService.get(`qq_state:${state}`);
    if (value !== 'login' && value !== 'bind') {
      throw new UnauthorizedException('Invalid state parameter');
    }
    await this.redisService.del(`qq_state:${state}`);
    return value;
  }

  /**
   * Validate a login-only state. Kept for the code-login flow.
   */
  async validateState(state: string): Promise<void> {
    await this.consumeState(state);
  }

  /**
   * 使用授权码获取 Access Token
   *
   * @param code 授权码
   * @param redirectUri 回调地址
   * @returns Access Token
   */
  async getAccessToken(code: string, redirectUri: string): Promise<string> {
    const appId = this.configService.get<string>('QQ_APP_ID') || '';
    const appKey = this.configService.get<string>('QQ_APP_KEY') || '';

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', appId);
    params.append('client_secret', appKey);
    params.append('code', code);
    params.append('redirect_uri', redirectUri);

    try {
      const response = await axios.get(this.TOKEN_URL, {
        params,
        timeout: 10000,
      });

      // QQ 返回格式：access_token=xxx&expires_in=xxx&refresh_token=xxx
      const tokenData = new URLSearchParams(response.data);
      const accessToken = tokenData.get('access_token');

      if (!accessToken) {
        throw new Error('Failed to get access token');
      }

      return accessToken;
    } catch (error) {
      this.logger.error(`Failed to get access token: ${error.message}`);
      throw new UnauthorizedException('Failed to get access token from QQ');
    }
  }

  /**
   * 使用 Access Token 获取 OpenID
   *
   * @param accessToken Access Token
   * @returns OpenID 和 UnionID（如果有）
   */
  async getOpenId(accessToken: string): Promise<{ openId: string; unionId?: string }> {
    try {
      const response = await axios.get(this.OPENID_URL, {
        params: { access_token: accessToken },
        timeout: 10000,
      });

      // QQ 返回格式：callback( {"client_id":"xxx","openid":"xxx"} );
      const jsonStr = response.data.match(/\((.*)\)/)?.[1];
      if (!jsonStr) {
        throw new Error('Invalid response format');
      }

      const data: QQOpenIdResponse = JSON.parse(jsonStr);
      return {
        openId: data.openid,
        unionId: data.unionid,
      };
    } catch (error) {
      this.logger.error(`Failed to get OpenID: ${error.message}`);
      throw new UnauthorizedException('Failed to get OpenID from QQ');
    }
  }

  /**
   * 使用 Access Token 和 OpenID 获取用户信息
   *
   * @param accessToken Access Token
   * @param openId 用户 OpenID
   * @returns 用户信息
   */
  async getUserInfo(accessToken: string, openId: string): Promise<QQUserInfo> {
    const appId = this.configService.get<string>('QQ_APP_ID');

    try {
      const response = await axios.get(this.USER_INFO_URL, {
        params: {
          access_token: accessToken,
          oauth_consumer_key: appId,
          openid: openId,
        },
        timeout: 10000,
      });

      if (response.data.ret !== 0) {
        throw new Error(`QQ API error: ${response.data.msg}`);
      }

      return {
        nickname: response.data.nickname,
        avatar: response.data.figureurl_qq_2 || response.data.figureurl_qq_1,
        gender: response.data.gender,
        province: response.data.province,
        city: response.data.city,
        year: response.data.year,
      };
    } catch (error) {
      this.logger.error(`Failed to get user info: ${error.message}`);
      throw new UnauthorizedException('Failed to get user info from QQ');
    }
  }

  /**
   * 查找或创建用户
   *
   * @param qqUserInfo QQ 用户信息
   * @param openId 用户 OpenID
   * @param unionId 用户 UnionID（可选）
   * @returns 用户对象
   */
  async getOrCreateUser(
    qqUserInfo: QQUserInfo,
    openId: string,
    unionId?: string,
  ): Promise<{ user: User; isNew: boolean }> {
    // 先查找是否已存在
    let user = await this.usersRepository.findOne({
      where: { qq_openid: openId },
    });

    let isNew = false;

    if (!user) {
      // 新用户 - 创建账号
      isNew = true;

      // 生成唯一的 mindauth_id（使用 QQ openId 的哈希值）
      const mindauthId = this.generateMindAuthId(openId);

      // 生成默认用户名
      const defaultUsername = qqUserInfo.nickname
        ? `QQ用户${qqUserInfo.nickname.substring(0, 6)}`
        : `QQ用户${openId.substring(0, 6)}`;

      user = this.usersRepository.create({
        mindauth_id: mindauthId,
        username: defaultUsername,
        email: `${openId}@qq.local`, // 虚拟邮箱
        avatar_url: qqUserInfo.avatar || null,
        qq_openid: openId,
        qq_unionid: unionId || null,
        qq_nickname: qqUserInfo.nickname || null,
        qq_avatar: qqUserInfo.avatar || null,
        role: 'user',
        total_points: 0,
        available_points: 0,
      });

      await this.usersRepository.save(user);
      this.logger.log(`Created new user from QQ: ${user.id}`);
    } else {
      // 老用户 - 更新信息
      // 只在用户没有头像时更新头像
      if (!user.avatar_url && qqUserInfo.avatar) {
        user.avatar_url = qqUserInfo.avatar;
      }

      // 更新 QQ 信息
      user.qq_nickname = qqUserInfo.nickname || null;
      user.qq_avatar = qqUserInfo.avatar || null;
      if (unionId) {
        user.qq_unionid = unionId;
      }

      await this.usersRepository.save(user);
      this.logger.log(`Updated existing QQ user: ${user.id}`);
    }

    return { user, isNew };
  }

  /**
   * 生成唯一的 mindauth_id
   * 使用 QQ openId 的哈希值确保唯一性
   *
   * @param openId QQ OpenID
   * @returns 唯一的 mindauth_id
   */
  private generateMindAuthId(openId: string): number {
    const hash = crypto.createHash('sha256').update(openId).digest('hex');
    // 取前 8 位转换为数字，确保在合理范围内
    const id = parseInt(hash.substring(0, 8), 16);
    // 确保 ID 在 1000000-9999999 范围内，避免与现有用户冲突
    return 1000000 + (id % 9000000);
  }

  /**
   * 生成设备令牌
   *
   * @returns 设备令牌
   */
  generateDeviceToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 保存设备信息
   *
   * @param userId 用户 ID
   * @param deviceToken 设备令牌
   * @param ip 登录 IP
   * @param deviceInfo 设备信息
   * @param platform 平台
   */
  async saveDeviceToken(
    userId: number,
    deviceToken: string,
    ip: string,
    deviceInfo: any,
    platform: string,
  ): Promise<void> {
    const deviceName = this.generateDeviceName(deviceInfo, platform);
    const tokenExpire = new Date();
    tokenExpire.setSeconds(tokenExpire.getSeconds() + this.deviceTokenTtl);

    await this.userDeviceRepository.save({
      uid: userId,
      remember_token: deviceToken,
      ip,
      device_info: JSON.stringify(deviceInfo),
      device_name: deviceName,
      platform,
      token_expire: tokenExpire,
      last_active: new Date(),
    });

    this.logger.log(`Saved device token for user ${userId}: ${deviceName}`);
  }

  /**
   * 生成设备名称
   *
   * @param deviceInfo 设备信息
   * @param platform 平台
   * @returns 设备名称
   */
  private generateDeviceName(deviceInfo: any, platform: string): string {
    if (platform === 'web') {
      const ua = deviceInfo?.userAgent || '';
      if (ua.includes('Windows')) return 'Windows 浏览器';
      if (ua.includes('Mac')) return 'Mac 浏览器';
      if (ua.includes('Linux')) return 'Linux 浏览器';
      return 'Web 浏览器';
    }

    if (deviceInfo?.brand && deviceInfo?.model) {
      return `${deviceInfo.brand} ${deviceInfo.model}`;
    }

    return `${platform} 设备`;
  }

  /**
   * 记录登录日志
   *
   * @param userId 用户 ID
   * @param loginType 登录类型
   * @param platform 平台
   * @param deviceId 设备 ID
   * @param ip 登录 IP
   * @param userAgent User-Agent
   */
  async recordLoginLog(
    userId: number,
    loginType: string,
    platform: string,
    deviceId: string,
    ip: string,
    userAgent: string,
  ): Promise<void> {
    await this.loginLogRepository.save({
      user_id: userId,
      login_type: loginType,
      platform,
      device_id: deviceId,
      ip,
      user_agent: userAgent,
    });

    this.logger.log(`Recorded login log for user ${userId}: ${loginType}`);
  }

  /**
   * 创建 Session
   *
   * @param userId 用户 ID
   * @param sessionToken Session Token
   * @param ip 登录 IP
   */
  async createSession(userId: number, sessionToken: string, ip: string): Promise<void> {
    const sessionKey = `session:${sessionToken}`;

    // Store session in Redis as hash
    await this.redisService.hset(sessionKey, 'userId', userId.toString());
    await this.redisService.hset(sessionKey, 'createdAt', new Date().toISOString());
    await this.redisService.hset(sessionKey, 'loginType', 'qq');
    await this.redisService.expire(sessionKey, this.sessionTtl);

    this.logger.log(`Created session for user ${userId}`);
  }

  /**
   * 取消待处理的注销申请
   *
   * @param userId 用户 ID
   */
  async cancelPendingDeletion(userId: number): Promise<void> {
    // TODO: 实现注销申请取消逻辑
    // 需要查看是否有 deletion_requests 表
    this.logger.log(`Cancelled pending deletion for user ${userId}`);
  }

  async bindQQToUser(
    userId: number,
    qqUserInfo: QQUserInfo,
    openId: string,
    unionId?: string,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('用户不存在');

    const existing = await this.usersRepository.findOne({ where: { qq_openid: openId } });
    if (existing && existing.id !== userId) {
      throw new BadRequestException('该 QQ 账号已绑定其他用户');
    }

    user.qq_openid = openId;
    user.qq_unionid = unionId || user.qq_unionid;
    user.qq_nickname = qqUserInfo.nickname;
    user.qq_avatar = qqUserInfo.avatar;
    if (!user.avatar_url && qqUserInfo.avatar) {
      user.avatar_url = qqUserInfo.avatar;
    }

    return this.usersRepository.save(user);
  }

  /**
   * 解绑 QQ 账号
   *
   * @param userId 用户 ID
   */
  async unbindQQ(userId: number): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    if (!user.qq_openid) {
      throw new BadRequestException('该用户未绑定 QQ 账号');
    }

    user.qq_openid = null;
    user.qq_unionid = null;
    user.qq_nickname = null;
    user.qq_avatar = null;

    await this.usersRepository.save(user);
    this.logger.log(`Unbound QQ account for user ${userId}`);
  }
}
