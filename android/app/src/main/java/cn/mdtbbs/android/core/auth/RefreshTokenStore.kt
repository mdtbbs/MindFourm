package cn.mdtbbs.android.core.auth

import cn.mdtbbs.android.core.auth.crypto.RefreshTokenCipher
import cn.mdtbbs.android.core.datastore.SecureValueStore

interface RefreshTokenStore {
    suspend fun read(): String?
    suspend fun replace(token: String)
    suspend fun clear()
}

class EncryptedRefreshTokenStore(
    private val values: SecureValueStore,
    private val cipher: RefreshTokenCipher,
) : RefreshTokenStore {
    override suspend fun read(): String? {
        val encoded = values.read() ?: return null
        return try { cipher.decrypt(encoded) } catch (_: Exception) { values.clear(); null }
    }
    override suspend fun replace(token: String) { values.write(cipher.encrypt(token)) }
    override suspend fun clear() { values.clear() }
}
