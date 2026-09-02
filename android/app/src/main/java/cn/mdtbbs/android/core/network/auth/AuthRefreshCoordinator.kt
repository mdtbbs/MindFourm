package cn.mdtbbs.android.core.network.auth

import cn.mdtbbs.android.core.auth.AccessTokenStore
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Serializes refresh-token use.  The server rotates refresh tokens and treats a
 * second use as token theft, so concurrent 401 responses must never refresh in
 * parallel.  Callers that waited for another request reuse its new access token.
 */
@Singleton
class AuthRefreshCoordinator @Inject constructor(
    private val accessTokens: AccessTokenStore,
    private val refresher: AccessTokenRefresher,
) {
    private val refreshMutex = Mutex()
    private var retryLaterForAccessToken: String? = null

    suspend fun refreshAfterUnauthorized(failedAccessToken: String?): String? = refreshMutex.withLock {
        if (failedAccessToken == retryLaterForAccessToken) return@withLock null
        val current = accessTokens.current()
        // A completed refresh changes the token; a terminal failure clears it.
        // Either state means this 401 has already been handled by the request
        // that acquired the mutex first.
        if (current != failedAccessToken) return@withLock current

        when (val result = refresher.refreshAccessToken()) {
            is RefreshAccessTokenResult.Refreshed -> {
                retryLaterForAccessToken = null
                result.accessToken
            }
            RefreshAccessTokenResult.RetryLater -> {
                retryLaterForAccessToken = failedAccessToken
                null
            }
            RefreshAccessTokenResult.Unauthenticated -> {
                refresher.clearSession()
                null
            }
        }
    }
}
