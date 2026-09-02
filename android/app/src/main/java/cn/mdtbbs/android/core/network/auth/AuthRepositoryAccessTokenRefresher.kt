package cn.mdtbbs.android.core.network.auth

import cn.mdtbbs.android.core.auth.AccessTokenStore
import cn.mdtbbs.android.core.auth.AuthRefreshOutcome
import cn.mdtbbs.android.core.auth.AuthRepository

/** Adapts the auth feature's rotation/revocation policy to the OkHttp boundary. */
class AuthRepositoryAccessTokenRefresher(
    private val repository: AuthRepository,
    private val accessTokens: AccessTokenStore,
) : AccessTokenRefresher {
    override suspend fun refreshAccessToken(): RefreshAccessTokenResult = when (repository.refreshForNetwork()) {
        AuthRefreshOutcome.Refreshed -> accessTokens.current()
            ?.takeIf { it.isNotBlank() }
            ?.let(RefreshAccessTokenResult::Refreshed)
            ?: RefreshAccessTokenResult.Unauthenticated
        AuthRefreshOutcome.RetryLater -> RefreshAccessTokenResult.RetryLater
        AuthRefreshOutcome.Unauthenticated -> RefreshAccessTokenResult.Unauthenticated
    }

    override suspend fun clearSession() = repository.clearLocalSession()
}
