package cn.mdtbbs.android.core.auth.model

data class MobileAuthUser(
    val id: Long,
    val username: String,
    val displayName: String?,
    val avatarUrl: String?,
    val phoneVerified: Boolean,
)

data class AuthenticatedSession(
    val sessionId: String,
    val user: MobileAuthUser,
    val accessTokenExpiresInSeconds: Long,
)

data class MobileTokenResponse(
    val accessToken: String,
    val accessTokenExpiresInSeconds: Long,
    val refreshToken: String,
    val session: AuthenticatedSession,
)

data class AuthCallback(val code: String, val state: String, val error: String? = null)

data class AuthLoginRequest(val authorizationUrl: String)

data class AuthTransaction(val transactionId: String, val expiresAtEpochMs: Long, val availableMethods: Set<String>)
data class AuthorizationCode(val value: String)
