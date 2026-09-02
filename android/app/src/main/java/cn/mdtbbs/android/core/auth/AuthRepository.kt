package cn.mdtbbs.android.core.auth

import cn.mdtbbs.android.core.auth.model.AuthCallback
import cn.mdtbbs.android.core.auth.model.AuthLoginRequest
import cn.mdtbbs.android.core.auth.model.AuthenticatedSession
import cn.mdtbbs.android.core.auth.model.MobileTokenResponse
import cn.mdtbbs.android.core.auth.model.AuthTransaction
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException
import java.net.URI
import java.net.URLEncoder

data class MobileAuthConfiguration(
    val authorizationEndpoint: String,
    val clientId: String,
    val redirectUri: String,
    val deviceName: String,
)

class AuthRepository(
    private val config: MobileAuthConfiguration,
    private val gateway: MobileAuthGateway,
    private val accessTokens: AccessTokenStore,
    private val refreshTokens: RefreshTokenStore,
    private val pendingStore: AuthPendingStore,
    private val pkce: PkceGenerator,
    private val nativeGateway: NativeAuthGateway? = null,
    private val nativeClientId: String = "mdtbbs_android",
    private val nowEpochMs: () -> Long = System::currentTimeMillis,
) {
    private val refreshMutex = Mutex()
    private val mutableState = MutableStateFlow<AuthState>(AuthState.Restoring)
    val state: StateFlow<AuthState> = mutableState.asStateFlow()
    private var nativePending: NativePending? = null

    /** Creates a short-lived in-memory PKCE binding for every native sign-in attempt. */
    suspend fun createTransaction(postLoginDestination: String? = null): AuthTransaction {
        val pair = pkce.generate()
        val transaction = native().createTransaction(nativeClientId, pair.challenge)
        nativePending = NativePending(transaction, pair.verifier, postLoginDestination)
        mutableState.value = AuthState.Authenticating(postLoginDestination)
        return transaction
    }

    suspend fun loginWithPassword(login: String, password: String): String? = completeNative { pending ->
        native().loginWithPassword(pending.transaction.transactionId, login, password)
    }

    suspend fun sendSms(phone: String): SmsChallenge = withPending { pending ->
        requireMethod(pending, "sms"); native().sendSms(pending.transaction.transactionId, phone)
    }

    suspend fun loginWithSms(challengeId: String, phone: String, code: String): String? = completeNative { pending ->
        requireMethod(pending, "sms"); native().loginWithSms(pending.transaction.transactionId, challengeId, phone, code)
    }

    suspend fun loginWithQq(provider: SocialAuthProvider): String? = completeNative { pending ->
        requireMethod(pending, "qq"); native().authorizeQq(pending.transaction.transactionId, provider.authorize())
    }

    suspend fun beginRegistration(): AuthTransaction = createTransaction()

    suspend fun register(phone: String, challengeId: String, code: String, username: String, password: String, email: String): String? = completeNative { pending ->
        requireMethod(pending, "sms")
        native().register(pending.transaction.transactionId, phone, challengeId, code, username, password, email)
    }

    suspend fun sendRegistrationSms(phone: String): SmsChallenge = withPending { pending ->
        requireMethod(pending, "sms"); native().sendSms(pending.transaction.transactionId, phone)
    }

    /*
     * MindAuth phone verification is intentionally unavailable to Android until
     * its server-side action-ticket issuer is deployed.  Keeping these calls at
     * the boundary produces an explicit user-facing state instead of sending an
     * invalid forum access token to MindAuth.
     */
    suspend fun sendPhoneVerificationSms(phone: String) = native().sendPhoneVerificationSms(phone)
    suspend fun verifyPhone(code: String) = native().verifyPhone(code)

    suspend fun startLogin(postLoginDestination: String? = null): AuthLoginRequest {
        val failure = configurationFailure()
        if (failure != null) { mutableState.value = AuthState.AuthenticationFailed(failure); throw IllegalStateException(failure.message) }
        val pair = pkce.generate()
        val pending = AuthPendingState(pair.verifier, pkce.randomUrlSafeValue(), pkce.randomUrlSafeValue(), config.redirectUri, postLoginDestination, nowEpochMs())
        pendingStore.save(pending)
        mutableState.value = AuthState.Authenticating(postLoginDestination)
        return AuthLoginRequest(buildAuthorizationUrl(pair.challenge, pending))
    }

    /** Handles one callback only; all terminal callback paths erase the PKCE verifier/state. */
    suspend fun handleCallback(callback: AuthCallback): String? {
        val pending = pendingStore.read()
        if (pending == null || nowEpochMs() - pending.createdAtEpochMs > PENDING_MAX_AGE_MS || callback.state != pending.state) {
            pendingStore.clear(); mutableState.value = AuthState.AuthenticationFailed(AuthFailure.StateMismatch); return null
        }
        try {
            if (!callback.error.isNullOrBlank() || callback.code.isBlank()) {
                mutableState.value = AuthState.AuthenticationFailed(AuthFailure.InvalidCallback); return null
            }
            val response = gateway.exchange(callback.code, pending.codeVerifier, pending.redirectUri, config.deviceName)
            install(response)
            return pending.postLoginDestination
        } catch (error: IOException) {
            mutableState.value = AuthState.AuthenticationFailed(AuthFailure.Network); return null
        } catch (error: Exception) {
            mutableState.value = AuthState.AuthenticationFailed(AuthFailure.Remote(error.safeMessage())); return null
        } finally { pendingStore.clear() }
    }

    suspend fun restoreSession() {
        mutableState.value = AuthState.Restoring
        val refresh = refreshTokens.read()
        if (refresh == null) { accessTokens.update(null); mutableState.value = AuthState.Anonymous; return }
        refreshInternal(refresh)
    }

    /** Safe boundary for the M2-D authenticator: concurrent callers share exactly one refresh. */
    suspend fun refreshForNetwork(): AuthRefreshOutcome = refreshMutex.withLock {
        val refresh = refreshTokens.read() ?: run { clearLocalSession(); return@withLock AuthRefreshOutcome.Unauthenticated }
        refreshInternal(refresh)
    }

    suspend fun logout() {
        val authenticated = (mutableState.value as? AuthState.Authenticated)?.session
        try { if (authenticated != null) gateway.logout(authenticated.sessionId) } finally { clearLocalSession() }
    }

    suspend fun clearLocalSession() {
        accessTokens.update(null); refreshTokens.clear(); pendingStore.clear(); mutableState.value = AuthState.Anonymous
    }

    private suspend fun refreshInternal(refresh: String): AuthRefreshOutcome = try {
        install(gateway.refresh(refresh)); AuthRefreshOutcome.Refreshed
    } catch (_: IOException) {
        // A transient outage must not destroy a valid 90-day refresh credential.
        mutableState.value = AuthState.AuthenticationFailed(AuthFailure.Network); AuthRefreshOutcome.RetryLater
    } catch (_: Exception) {
        clearLocalSession(); AuthRefreshOutcome.Unauthenticated
    }

    private suspend fun install(response: MobileTokenResponse) {
        // Rotation is durable before publishing the access token. If this fails, no stale R0 remains usable.
        try { refreshTokens.replace(response.refreshToken) } catch (error: Exception) { clearLocalSession(); throw error }
        accessTokens.update(response.accessToken)
        mutableState.value = AuthState.Authenticated(response.session)
    }

    private suspend fun completeNative(authorize: suspend (NativePending) -> cn.mdtbbs.android.core.auth.model.AuthorizationCode): String? {
        val pending = nativePending ?: return failNative(NativeAuthException("AUTH_TRANSACTION_EXPIRED"))
        if (nowEpochMs() >= pending.transaction.expiresAtEpochMs) return failNative(NativeAuthException("AUTH_TRANSACTION_EXPIRED"))
        var authorizationCodeIssued = false
        return try {
            val code = authorize(pending)
            authorizationCodeIssued = true
            val response = gateway.exchange(code.value, pending.verifier, config.redirectUri, config.deviceName)
            install(response)
            nativePending = null
            pending.destination
        } catch (error: Exception) {
            // A rejected password/SMS attempt does not consume the transaction.
            // Keeping its PKCE verifier lets the user correct the input and retry
            // without silently falling into the misleading "transaction expired"
            // state. Once an authorization code has been issued, it is single-use,
            // so force a fresh transaction after any failed exchange instead.
            if (authorizationCodeIssued) nativePending = null
            mutableState.value = AuthState.AuthenticationFailed(error.toFailure()); null
        }
    }

    private suspend fun <T> withPending(block: suspend (NativePending) -> T): T {
        val pending = nativePending ?: throw NativeAuthException("AUTH_TRANSACTION_EXPIRED")
        if (nowEpochMs() >= pending.transaction.expiresAtEpochMs) { nativePending = null; throw NativeAuthException("AUTH_TRANSACTION_EXPIRED") }
        return block(pending)
    }
    private fun requireMethod(pending: NativePending, method: String) { if (method !in pending.transaction.availableMethods) throw NativeAuthException("METHOD_DISABLED") }
    private fun native(): NativeAuthGateway = nativeGateway ?: throw NativeAuthException("NATIVE_AUTH_UNAVAILABLE")
    private fun failNative(error: Exception): String? { mutableState.value = AuthState.AuthenticationFailed(error.toFailure()); nativePending = null; return null }
    private fun Exception.toFailure(): AuthFailure = when (this) {
        is IOException -> AuthFailure.Network
        is NativeAuthException -> AuthFailure.Native(code)
        else -> AuthFailure.Remote(safeMessage())
    }
    private data class NativePending(val transaction: AuthTransaction, val verifier: String, val destination: String?)

    private fun configurationFailure(): AuthFailure.Configuration? = when {
        config.authorizationEndpoint.toHttpsUriOrNull() == null -> AuthFailure.Configuration("OAuth authorization endpoint is not configured as HTTPS")
        config.redirectUri.toHttpsUriOrNull() == null -> AuthFailure.Configuration("Verified HTTPS App Link redirect URI is not configured")
        config.clientId.isBlank() -> AuthFailure.Configuration("OAuth client id is not configured")
        else -> null
    }
    private fun buildAuthorizationUrl(challenge: String, pending: AuthPendingState): String {
        val separator = if (config.authorizationEndpoint.contains('?')) '&' else '?'
        val query = listOf(
            "response_type" to "code", "client_id" to config.clientId, "redirect_uri" to config.redirectUri,
            "code_challenge" to challenge, "code_challenge_method" to "S256", "state" to pending.state, "nonce" to pending.nonce,
        ).joinToString("&") { (key, value) -> "$key=${URLEncoder.encode(value, Charsets.UTF_8.name())}" }
        return "${config.authorizationEndpoint}$separator$query"
    }
    private fun String.toHttpsUriOrNull(): URI? = runCatching { URI(this).takeIf { it.scheme == "https" && !it.host.isNullOrBlank() } }.getOrNull()
    private fun Exception.safeMessage() = message?.take(200) ?: "Authentication request failed"
    private companion object { const val PENDING_MAX_AGE_MS = 10 * 60 * 1000L }
}

sealed interface AuthRefreshOutcome {
    data object Refreshed : AuthRefreshOutcome
    /** The persisted credential is retained; callers must not retry in a loop. */
    data object RetryLater : AuthRefreshOutcome
    data object Unauthenticated : AuthRefreshOutcome
}
