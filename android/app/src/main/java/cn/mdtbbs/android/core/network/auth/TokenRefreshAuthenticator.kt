package cn.mdtbbs.android.core.network.auth

import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject
import javax.inject.Singleton

/** Retries a failed Bearer request once after the shared refresh coordinator. */
@Singleton
class TokenRefreshAuthenticator @Inject constructor(
    private val refreshCoordinator: AuthRefreshCoordinator,
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.isMobileTokenExchangeOrRefresh() || responseCount(response) >= 2) return null

        val failedToken = response.request.header(AUTHORIZATION)
            ?.removePrefix("Bearer ")
            ?.takeIf { it.isNotBlank() }
            ?: return null
        val freshToken = runBlocking { refreshCoordinator.refreshAfterUnauthorized(failedToken) } ?: return null

        return response.request.newBuilder()
            .header(AUTHORIZATION, "Bearer $freshToken")
            .build()
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
