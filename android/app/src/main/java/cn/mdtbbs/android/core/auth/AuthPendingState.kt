package cn.mdtbbs.android.core.auth

data class AuthPendingState(
    val codeVerifier: String,
    val state: String,
    val nonce: String,
    val redirectUri: String,
    val postLoginDestination: String?,
    val createdAtEpochMs: Long,
)

interface AuthPendingStore {
    suspend fun read(): AuthPendingState?
    suspend fun save(pending: AuthPendingState)
    suspend fun clear()
}
