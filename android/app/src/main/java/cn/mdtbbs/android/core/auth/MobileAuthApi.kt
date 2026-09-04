package cn.mdtbbs.android.core.auth

import cn.mdtbbs.android.core.auth.model.AuthenticatedSession
import cn.mdtbbs.android.core.auth.model.MobileAuthUser
import cn.mdtbbs.android.core.auth.model.MobileTokenResponse
import cn.mdtbbs.android.core.network.V1Envelope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Header

interface MobileAuthApi {
    @POST("api/v1/auth/mobile/exchange") suspend fun exchange(@Body request: MobileExchangeRequest): V1Envelope<MobileTokenDto>
    @POST("api/v1/auth/mobile/refresh") suspend fun refresh(@Body request: MobileRefreshRequest): V1Envelope<MobileTokenDto>
    @POST("api/v1/auth/mobile/logout") suspend fun logout(@Header("Authorization") authorization: String, @Body request: MobileLogoutRequest): V1Envelope<RevokedDto>
}

@Serializable data class MobileExchangeRequest(
    val code: String, @SerialName("code_verifier") val codeVerifier: String,
    @SerialName("redirect_uri") val redirectUri: String, @SerialName("device_name") val deviceName: String,
)
@Serializable data class MobileRefreshRequest(@SerialName("refresh_token") val refreshToken: String)
@Serializable data class MobileLogoutRequest(@SerialName("session_id") val sessionId: String)
@Serializable data class RevokedDto(val revoked: Boolean)
@Serializable data class MobileTokenDto(
    @SerialName("access_token") val accessToken: String,
    @SerialName("access_token_expires_in") val accessTokenExpiresIn: Long,
    @SerialName("refresh_token") val refreshToken: String,
    val session: MobileSessionDto, val user: MobileUserDto,
)
@Serializable data class MobileSessionDto(val id: String, @SerialName("device_name") val deviceName: String)
@Serializable data class MobileUserDto(val id: Long, val username: String, @SerialName("avatar_url") val avatarUrl: String? = null, @SerialName("phone_verified") val phoneVerified: Boolean)

class RetrofitMobileAuthGateway(private val api: MobileAuthApi, private val accessTokens: AccessTokenStore) : MobileAuthGateway {
    override suspend fun exchange(code: String, codeVerifier: String, redirectUri: String, deviceName: String) = api.exchange(MobileExchangeRequest(code, codeVerifier, redirectUri, deviceName)).data.toDomain()
    override suspend fun refresh(refreshToken: String) = api.refresh(MobileRefreshRequest(refreshToken)).data.toDomain()
    override suspend fun logout(sessionId: String) {
        val token = accessTokens.current() ?: throw IllegalStateException("No mobile access token for logout")
        api.logout("Bearer $token", MobileLogoutRequest(sessionId))
    }
}

private fun MobileTokenDto.toDomain() = MobileTokenResponse(
    accessToken, accessTokenExpiresIn, refreshToken,
    AuthenticatedSession(session.id, MobileAuthUser(user.id, user.username, null, user.avatarUrl, user.phoneVerified), accessTokenExpiresIn),
)
