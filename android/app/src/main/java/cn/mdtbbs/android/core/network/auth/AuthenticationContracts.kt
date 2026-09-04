package cn.mdtbbs.android.core.network.auth

/**
 * Boundary implemented by the authentication feature.  Networking deliberately
 * does not know where the rotating refresh token is stored.
 */
interface AccessTokenRefresher {
    suspend fun refreshAccessToken(): RefreshAccessTokenResult
    suspend fun clearSession()
}

sealed interface RefreshAccessTokenResult {
    data class Refreshed(val accessToken: String) : RefreshAccessTokenResult
    /** A transport failure: retain the rotating credential but do not retry this response. */
    data object RetryLater : RefreshAccessTokenResult
    data object Unauthenticated : RefreshAccessTokenResult
}
