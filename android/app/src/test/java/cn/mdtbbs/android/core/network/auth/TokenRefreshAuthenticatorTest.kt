package cn.mdtbbs.android.core.network.auth

import cn.mdtbbs.android.core.auth.InMemoryAccessTokenStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

class TokenRefreshAuthenticatorTest {
    @Test
    fun `five simultaneous 401 responses perform one rotating refresh`() = runBlocking {
        val tokens = InMemoryAccessTokenStore().apply { update("expired-access") }
        val refresher = FakeRefresher(tokens, succeeds = true)
        val authenticator = TokenRefreshAuthenticator(AuthRefreshCoordinator(tokens, refresher))

        val retried = (1..5).map {
            async(Dispatchers.Default) { authenticator.authenticate(null, unauthorizedResponse("expired-access")) }
        }.awaitAll()

        assertEquals(1, refresher.refreshCalls.get())
        retried.forEach { request -> assertEquals("Bearer fresh-access", request?.header(AUTHORIZATION)) }
    }

    @Test
    fun `failed concurrent refresh clears once and retries none`() = runBlocking {
        val tokens = InMemoryAccessTokenStore().apply { update("expired-access") }
        val refresher = FakeRefresher(tokens, succeeds = false)
        val authenticator = TokenRefreshAuthenticator(AuthRefreshCoordinator(tokens, refresher))

        val retried = (1..5).map {
            async(Dispatchers.Default) { authenticator.authenticate(null, unauthorizedResponse("expired-access")) }
        }.awaitAll()

        assertEquals(1, refresher.refreshCalls.get())
        assertEquals(1, refresher.clearCalls.get())
        retried.forEach(::assertNull)
    }

    @Test
    fun `refresh endpoint is never authenticated or retried`() {
        val tokens = InMemoryAccessTokenStore().apply { update("expired-access") }
        val refresher = FakeRefresher(tokens, succeeds = true)
        val authenticator = TokenRefreshAuthenticator(AuthRefreshCoordinator(tokens, refresher))
        val request = Request.Builder().url("https://mdtbbs.cn/api/v1/auth/mobile/refresh").build()

        assertNull(authenticator.authenticate(null, unauthorizedResponse(request)))
        assertEquals(0, refresher.refreshCalls.get())
    }

    private fun unauthorizedResponse(accessToken: String): Response = unauthorizedResponse(
        Request.Builder()
            .url("https://mdtbbs.cn/api/v1/me")
            .header(AUTHORIZATION, "Bearer $accessToken")
            .build(),
    )

    private fun unauthorizedResponse(request: Request): Response = Response.Builder()
        .request(request)
        .protocol(Protocol.HTTP_1_1)
        .code(401)
        .message("Unauthorized")
        .build()

    private class FakeRefresher(
        private val tokens: InMemoryAccessTokenStore,
        private val succeeds: Boolean,
    ) : AccessTokenRefresher {
        val refreshCalls = AtomicInteger()
        val clearCalls = AtomicInteger()

        override suspend fun refreshAccessToken(): RefreshAccessTokenResult {
            refreshCalls.incrementAndGet()
            delay(100)
            return if (succeeds) {
                tokens.update("fresh-access")
                RefreshAccessTokenResult.Refreshed("fresh-access")
            } else {
                RefreshAccessTokenResult.Unauthenticated
            }
        }

        override suspend fun clearSession() {
            clearCalls.incrementAndGet()
            tokens.update(null)
        }
    }
}
