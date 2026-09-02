package cn.mdtbbs.android.core.auth

import cn.mdtbbs.android.core.auth.model.AuthTransaction
import cn.mdtbbs.android.core.auth.model.AuthorizationCode

class RetrofitNativeAuthGateway(private val api: NativeAuthApi, private val accessTokens: AccessTokenStore, private val now: () -> Long = System::currentTimeMillis) : NativeAuthGateway {
    override suspend fun createTransaction(clientId: String, codeChallenge: String): AuthTransaction = api.create(CreateTransactionRequest(clientId, codeChallenge, "S256")).let { AuthTransaction(it.transactionId, now() + it.expiresIn * 1000, it.methods.toSet()) }
    override suspend fun loginWithPassword(transactionId: String, login: String, password: String) = api.password(transactionId, PasswordRequest(login, password)).code()
    override suspend fun sendSms(transactionId: String, phone: String) = api.sendSms(transactionId, PhoneRequest(phone)).sms()
    override suspend fun loginWithSms(transactionId: String, challengeId: String, phone: String, code: String) = api.verifySms(transactionId, VerifySmsRequest(challengeId, phone, code)).code()
    // QQ is deliberately not invoked until an official SDK provides a real
    // provider authorization code.  Do not manufacture a provider payload.
    override suspend fun authorizeQq(transactionId: String, credential: ProviderCredential): Nothing = throw NativeAuthException("QQ_AUTH_UNAVAILABLE")
    override suspend fun register(transactionId: String, phone: String, challengeId: String, code: String, username: String, password: String, email: String) = api.register(RegisterRequest(transactionId, phone, challengeId, code, username, password, email)).code()
    override suspend fun sendPhoneVerificationSms(phone: String): Nothing = throw NativeAuthException("PHONE_VERIFICATION_UNAVAILABLE")
    override suspend fun verifyPhone(code: String): Nothing = throw NativeAuthException("PHONE_VERIFICATION_UNAVAILABLE")
    private fun AuthorizationCodeDto.code(): AuthorizationCode { if (authorizationCode.isBlank()) throw NativeAuthException("AUTHORIZATION_FAILED"); return AuthorizationCode(authorizationCode) }
    private fun SmsChallengeDto.sms() = SmsChallenge(challengeId, now() + expiresIn * 1000, now() + retryAfter * 1000)
}
