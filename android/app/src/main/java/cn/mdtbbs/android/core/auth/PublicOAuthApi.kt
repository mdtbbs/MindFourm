package cn.mdtbbs.android.core.auth

import cn.mdtbbs.android.core.auth.model.AuthenticatedSession
import cn.mdtbbs.android.core.auth.model.MobileTokenResponse
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

interface PublicOAuthApi {
    @POST("api/token") suspend fun token(@Body request: PublicOAuthTokenRequest): PublicOAuthTokenDto
    @POST("api/revoke") suspend fun revoke(@Body request: PublicOAuthRevokeRequest): PublicOAuthRevocationDto
}

@Serializable
data class PublicOAuthTokenRequest(
    @SerialName("grant_type") val grantType: String,
    @SerialName("client_id") val clientId: String,
    val code: String? = null,
    @SerialName("redirect_uri") val redirectUri: String? = null,
    @SerialName("code_verifier") val codeVerifier: String? = null,
    @SerialName("refresh_token") val refreshToken: String? = null,
)

@Serializable
data class PublicOAuthRevokeRequest(
    val token: String,
    @SerialName("client_id") val clientId: String,
    @SerialName("token_type_hint") val tokenTypeHint: String,
)

@Serializable data class PublicOAuthRevocationDto(val success: Boolean = true)

@Serializable
data class PublicOAuthTokenDto(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_in") val expiresIn: Long,
)

class RetrofitPublicOAuthGateway(
    private val api: PublicOAuthApi,
    private val clientId: String,
) : PublicOAuthGateway {
    override suspend fun exchange(code: String, codeVerifier: String, redirectUri: String) = api.token(
        PublicOAuthTokenRequest(
            grantType = "authorization_code", clientId = clientId, code = code,
            redirectUri = redirectUri, codeVerifier = codeVerifier,
        ),
    ).toDomain()

    override suspend fun refresh(refreshToken: String) = api.token(
        PublicOAuthTokenRequest(grantType = "refresh_token", clientId = clientId, refreshToken = refreshToken),
    ).toDomain()

    override suspend fun revoke(refreshToken: String, accessToken: String?) {
        // Revoke both credentials. RFC 7009 deliberately returns success for
        // unknown/already-revoked values; still attempt refresh if access revoke fails.
        if (accessToken != null) runCatching {
            api.revoke(PublicOAuthRevokeRequest(accessToken, clientId, "access_token"))
        }
        runCatching { api.revoke(PublicOAuthRevokeRequest(refreshToken, clientId, "refresh_token")) }
    }

    private fun PublicOAuthTokenDto.toDomain() = MobileTokenResponse(
        accessToken = accessToken,
        accessTokenExpiresInSeconds = expiresIn,
        refreshToken = refreshToken,
        session = AuthenticatedSession(sessionId = null, user = null, accessTokenExpiresInSeconds = expiresIn),
    )
}
