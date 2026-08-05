/**
 * QQ 用户信息接口
 */
export interface QQUserInfo {
  /** QQ 昵称 */
  nickname: string;
  /** QQ 头像 URL */
  avatar: string;
  /** 性别 (male/female) */
  gender?: string;
  /** 省份 */
  province?: string;
  /** 城市 */
  city?: string;
  /** 年份 */
  year?: string;
}

/**
 * QQ OAuth Token 响应
 */
export interface QQTokenResponse {
  /** Access Token */
  access_token: string;
  /** 过期时间（秒） */
  expires_in: number;
  /** Refresh Token */
  refresh_token?: string;
}

/**
 * QQ OpenID 响应
 */
export interface QQOpenIdResponse {
  /** 客户端 ID */
  client_id: string;
  /** 用户 OpenID */
  openid: string;
  /** UnionID（如果应用已添加添加 UnionID 权限） */
  unionid?: string;
}
