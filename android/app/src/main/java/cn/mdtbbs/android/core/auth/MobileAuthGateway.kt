package cn.mdtbbs.android.core.auth

import cn.mdtbbs.android.core.auth.model.MobileTokenResponse

/** Network boundary for the mobile-auth endpoints; it must use a bare client, never the authenticator. */
interface MobileAuthGateway {
    suspend fun exchange(code: String, codeVerifier: String, redirectUri: String, deviceName: String): MobileTokenResponse
    suspend fun refresh(refreshToken: String): MobileTokenResponse
    suspend fun logout(sessionId: String)
}
