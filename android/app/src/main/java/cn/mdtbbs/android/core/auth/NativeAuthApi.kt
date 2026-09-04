package cn.mdtbbs.android.core.auth

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

interface NativeAuthApi {
    @POST("api/v1/native/auth/transactions") suspend fun create(@Body request: CreateTransactionRequest): TransactionDto
    @POST("api/v1/native/auth/transactions/{id}/password") suspend fun password(@Path("id") id: String, @Body request: PasswordRequest): AuthorizationCodeDto
    @POST("api/v1/native/auth/transactions/{id}/sms/send") suspend fun sendSms(@Path("id") id: String, @Body request: PhoneRequest): SmsChallengeDto
    @POST("api/v1/native/auth/transactions/{id}/sms/verify") suspend fun verifySms(@Path("id") id: String, @Body request: VerifySmsRequest): AuthorizationCodeDto
    @POST("api/v1/native/register") suspend fun register(@Body request: RegisterRequest): AuthorizationCodeDto
}

@Serializable data class CreateTransactionRequest(@SerialName("client_id") val clientId: String, @SerialName("code_challenge") val codeChallenge: String, @SerialName("code_challenge_method") val method: String)
@Serializable data class PasswordRequest(val login: String, val password: String)
@Serializable data class PhoneRequest(val phone: String)
@Serializable data class VerifySmsRequest(@SerialName("challenge_id") val challengeId: String, val phone: String, val code: String)
@Serializable data class RegisterRequest(@SerialName("transaction_id") val transactionId: String, val phone: String, @SerialName("challenge_id") val challengeId: String, @SerialName("sms_code") val smsCode: String, val username: String, val password: String, val email: String)
@Serializable data class TransactionDto(@SerialName("transaction_id") val transactionId: String, @SerialName("expires_in") val expiresIn: Long, val methods: List<String> = emptyList())
@Serializable data class SmsChallengeDto(@SerialName("challenge_id") val challengeId: String, @SerialName("expires_in") val expiresIn: Long, @SerialName("retry_after") val retryAfter: Long)
@Serializable data class AuthorizationCodeDto(@SerialName("authorization_code") val authorizationCode: String, @SerialName("expires_in") val expiresIn: Long)
