package cn.mdtbbs.android.core.auth

import cn.mdtbbs.android.core.auth.model.MobileTokenResponse

/** MindAuth Public Client token boundary. It never carries a client secret. */
interface PublicOAuthGateway {
    suspend fun exchange(code: String, codeVerifier: String, redirectUri: String): MobileTokenResponse
    suspend fun refresh(refreshToken: String): MobileTokenResponse
    suspend fun revoke(refreshToken: String, accessToken: String?)
}
