package cn.mdtbbs.android.core.auth

import cn.mdtbbs.android.core.auth.model.AuthTransaction
import cn.mdtbbs.android.core.auth.model.AuthorizationCode

/** MindAuth native-auth boundary. Sensitive values only cross this short-lived boundary. */
interface NativeAuthGateway {
    suspend fun createTransaction(clientId: String, codeChallenge: String): AuthTransaction
    suspend fun loginWithPassword(transactionId: String, login: String, password: String): AuthorizationCode
    suspend fun sendSms(transactionId: String, phone: String): SmsChallenge
    suspend fun loginWithSms(transactionId: String, challengeId: String, phone: String, code: String): AuthorizationCode
    suspend fun authorizeQq(transactionId: String, credential: ProviderCredential): AuthorizationCode
    suspend fun register(transactionId: String, phone: String, challengeId: String, code: String, username: String, password: String, email: String): AuthorizationCode
    suspend fun sendPhoneVerificationSms(phone: String)
    suspend fun verifyPhone(code: String)
}

data class SmsChallenge(val challengeId: String, val expiresAtEpochMs: Long, val retryAtEpochMs: Long)
data class ProviderCredential(val provider: String, val payload: Map<String, String>)

interface SocialAuthProvider { suspend fun authorize(): ProviderCredential }

/** A deliberately non-functional placeholder until the official QQ SDK supplies real credentials. */
class UnsupportedQqAuthProvider : SocialAuthProvider {
    override suspend fun authorize(): ProviderCredential = throw NativeAuthException("QQ_AUTH_UNAVAILABLE")
}

class NativeAuthException(val code: String, message: String = code) : Exception(message)
