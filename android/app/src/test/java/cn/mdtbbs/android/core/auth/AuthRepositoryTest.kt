package cn.mdtbbs.android.core.auth

import cn.mdtbbs.android.core.auth.crypto.RefreshTokenCipher
import cn.mdtbbs.android.core.auth.model.*
import cn.mdtbbs.android.core.datastore.SecureValueStore
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class AuthRepositoryTest {
    @Test fun `pkce uses S256 and a fresh verifier`() {
        val generator = PkceGenerator()
        val first = generator.generate(); val second = generator.generate()
        assertNotEquals(first.verifier, second.verifier)
        assertEquals(43, first.challenge.length)
        assertFalse(first.challenge.contains('='))
    }

    @Test fun `callback exchanges only after strict state match and clears pending`() = runTest {
        val pending = FakePendingStore(); val gateway = FakeGateway(); val access = InMemoryAccessTokenStore()
        val repository = repository(pending, gateway, access)
        val request = repository.startLogin("thread/20")
        assertTrue(request.authorizationUrl.contains("code_challenge_method=S256"))
        assertNull(repository.handleCallback(AuthCallback("code", "wrong")))
        assertEquals(0, gateway.exchangeCalls); assertNull(pending.value)
        assertTrue(repository.state.value is AuthState.AuthenticationFailed)
    }

    @Test fun `successful callback persists rotated token before authenticated state`() = runTest {
        val pending = FakePendingStore(); val gateway = FakeGateway(); val access = InMemoryAccessTokenStore(); val refresh = FakeRefreshStore()
        val repository = repository(pending, gateway, access, refresh)
        repository.startLogin("thread/20")
        val state = pending.value!!
        assertEquals("thread/20", repository.handleCallback(AuthCallback("code", state.state)))
        assertEquals("access-1", access.current()); assertEquals("refresh-1", refresh.value)
        assertTrue(repository.state.value is AuthState.Authenticated); assertNull(pending.value)
    }

    @Test fun `transient refresh failure retains durable refresh credential`() = runTest {
        val refresh = FakeRefreshStore("refresh-1"); val gateway = FakeGateway(refreshFailure = java.io.IOException())
        val repository = repository(FakePendingStore(), gateway, InMemoryAccessTokenStore(), refresh)
        assertEquals(AuthRefreshOutcome.RetryLater, repository.refreshForNetwork())
        assertEquals("refresh-1", refresh.value); assertTrue(repository.state.value is AuthState.AuthenticationFailed)
    }

    @Test fun `restore without a refresh credential becomes anonymous`() = runTest {
        val repository = repository(FakePendingStore(), FakeGateway(), InMemoryAccessTokenStore())

        repository.restoreSession()

        assertEquals(AuthState.Anonymous, repository.state.value)
    }

    @Test fun `native password exchanges authorization code with the transaction PKCE verifier`() = runTest {
        val gateway = FakeGateway(); val native = FakeNativeGateway(); val repository = AuthRepository(
            MobileAuthConfiguration("https://auth.example/authorize", "android", "https://forum.example/callback", "Test"), gateway, InMemoryAccessTokenStore(), FakeRefreshStore(), FakePendingStore(), PkceGenerator(), native,
        )
        repository.createTransaction("thread/20")
        assertEquals("thread/20", repository.loginWithPassword("user", "password"))
        assertEquals(1, native.passwordCalls); assertEquals(1, gateway.exchangeCalls)
        assertTrue(repository.state.value is AuthState.Authenticated)
    }

    @Test fun `native password can retry after credentials are rejected`() = runTest {
        val gateway = FakeGateway()
        val native = FakeNativeGateway(passwordFailures = 1)
        val repository = AuthRepository(
            MobileAuthConfiguration("https://auth.example/authorize", "android", "https://forum.example/callback", "Test"), gateway, InMemoryAccessTokenStore(), FakeRefreshStore(), FakePendingStore(), PkceGenerator(), native,
        )

        repository.createTransaction()
        assertNull(repository.loginWithPassword("user", "wrong-password"))
        assertTrue(repository.state.value is AuthState.AuthenticationFailed)

        assertNull(repository.loginWithPassword("user", "correct-password"))
        assertEquals(2, native.passwordCalls)
        assertEquals(1, gateway.exchangeCalls)
        assertTrue(repository.state.value is AuthState.Authenticated)
    }

    @Test fun `native transaction rejects disabled method without calling MindAuth`() = runTest {
        val native = FakeNativeGateway(methods = setOf("password")); val repository = AuthRepository(
            MobileAuthConfiguration("https://auth.example/authorize", "android", "https://forum.example/callback", "Test"), FakeGateway(), InMemoryAccessTokenStore(), FakeRefreshStore(), FakePendingStore(), PkceGenerator(), native,
        )
        repository.createTransaction()
        try { repository.sendSms("13800000000"); fail("expected disabled SMS method") } catch (_: NativeAuthException) { }
        assertEquals(0, native.smsCalls)
    }

    @Test fun `native registration reuses one transaction and includes email`() = runTest {
        val gateway = FakeGateway(); val native = FakeNativeGateway(); val repository = AuthRepository(
            MobileAuthConfiguration("https://auth.example/authorize", "android", "", "Test"), gateway, InMemoryAccessTokenStore(), FakeRefreshStore(), FakePendingStore(), PkceGenerator(), native,
        )
        repository.beginRegistration()
        val challenge = repository.sendRegistrationSms("13800138000")
        assertNull(repository.register("13800138000", challenge.challengeId, "123456", "new_user", "PassWord123", "new@example.com"))
        assertEquals(1, native.registerCalls)
        assertEquals("tx", native.registerTransactionId)
        assertEquals("new@example.com", native.registerEmail)
        assertEquals(1, gateway.exchangeCalls)
    }

    private fun repository(pending: FakePendingStore, gateway: FakeGateway, access: InMemoryAccessTokenStore, refresh: FakeRefreshStore = FakeRefreshStore()) = AuthRepository(
        MobileAuthConfiguration("https://auth.example/authorize", "android", "https://forum.example/oauth/callback", "Test"), gateway, access, refresh, pending, PkceGenerator(),
    )
}

private class FakeNativeGateway(
    private val methods: Set<String> = setOf("password", "sms", "qq"),
    private var passwordFailures: Int = 0,
) : NativeAuthGateway {
    var passwordCalls = 0; var smsCalls = 0; var registerCalls = 0
    var registerTransactionId: String? = null; var registerEmail: String? = null
    override suspend fun createTransaction(clientId: String, codeChallenge: String) = AuthTransaction("tx", Long.MAX_VALUE, methods)
    override suspend fun loginWithPassword(transactionId: String, login: String, password: String): AuthorizationCode {
        passwordCalls++
        if (passwordFailures-- > 0) throw NativeAuthException("INVALID_CREDENTIALS")
        return AuthorizationCode("code")
    }
    override suspend fun sendSms(transactionId: String, phone: String): SmsChallenge { smsCalls++; return SmsChallenge("sms", Long.MAX_VALUE, 0) }
    override suspend fun loginWithSms(transactionId: String, challengeId: String, phone: String, code: String) = AuthorizationCode("code")
    override suspend fun authorizeQq(transactionId: String, credential: ProviderCredential) = AuthorizationCode("code")
    override suspend fun register(transactionId: String, phone: String, challengeId: String, code: String, username: String, password: String, email: String): AuthorizationCode {
        registerCalls++; registerTransactionId = transactionId; registerEmail = email; return AuthorizationCode("code")
    }
    override suspend fun sendPhoneVerificationSms(phone: String) = Unit
    override suspend fun verifyPhone(code: String) = Unit
}

private class FakePendingStore : AuthPendingStore { var value: AuthPendingState? = null; override suspend fun read() = value; override suspend fun save(pending: AuthPendingState) { value = pending }; override suspend fun clear() { value = null } }
private class FakeRefreshStore(var value: String? = null) : RefreshTokenStore { override suspend fun read() = value; override suspend fun replace(token: String) { value = token }; override suspend fun clear() { value = null } }
private class FakeGateway(private val refreshFailure: Exception? = null) : MobileAuthGateway {
    var exchangeCalls = 0
    override suspend fun exchange(code: String, codeVerifier: String, redirectUri: String, deviceName: String): MobileTokenResponse { exchangeCalls++; return response() }
    override suspend fun refresh(refreshToken: String): MobileTokenResponse { refreshFailure?.let { throw it }; return response() }
    override suspend fun logout(sessionId: String) = Unit
    private fun response() = MobileTokenResponse("access-1", 1800, "refresh-1", AuthenticatedSession("session", MobileAuthUser(1, "user", null, null, true), 1800))
}
