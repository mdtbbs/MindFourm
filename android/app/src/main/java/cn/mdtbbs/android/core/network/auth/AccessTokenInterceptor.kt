package cn.mdtbbs.android.core.network.auth

import cn.mdtbbs.android.core.auth.AccessTokenStore
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/** Adds the in-memory mobile Bearer token, never a persisted refresh token. */
@Singleton
class AccessTokenInterceptor @Inject constructor(
    private val accessTokens: AccessTokenStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.isMobileTokenExchangeOrRefresh()) return chain.proceed(request)

        val token = accessTokens.current()
        return chain.proceed(
            if (token.isNullOrBlank()) request
            else request.newBuilder().header(AUTHORIZATION, "Bearer $token").build(),
        )
    }
}

internal const val AUTHORIZATION = "Authorization"

internal fun okhttp3.Request.isMobileTokenExchangeOrRefresh(): Boolean {
    val path = url.encodedPath.trimEnd('/')
    return path.endsWith("/api/v1/auth/mobile/exchange") ||
        path.endsWith("/api/v1/auth/mobile/refresh")
}
