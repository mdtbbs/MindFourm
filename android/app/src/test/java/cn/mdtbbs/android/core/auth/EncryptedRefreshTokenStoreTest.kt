package cn.mdtbbs.android.core.auth

import cn.mdtbbs.android.core.auth.crypto.RefreshTokenCipher
import cn.mdtbbs.android.core.datastore.SecureValueStore
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class EncryptedRefreshTokenStoreTest {
    @Test fun `encrypted value is persisted and can be recovered`() = runTest {
        val values = FakeValues(); val store = EncryptedRefreshTokenStore(values, PrefixCipher())
        store.replace("refresh-secret")
        assertNotEquals("refresh-secret", values.value); assertEquals("refresh-secret", store.read())
    }
    @Test fun `unreadable ciphertext is removed`() = runTest {
        val values = FakeValues("broken"); val store = EncryptedRefreshTokenStore(values, PrefixCipher())
        assertNull(store.read()); assertNull(values.value)
    }
}
private class FakeValues(var value: String? = null) : SecureValueStore { override suspend fun read() = value; override suspend fun write(value: String) { this.value = value }; override suspend fun clear() { value = null } }
private class PrefixCipher : RefreshTokenCipher { override fun encrypt(plainText: String) = "cipher:$plainText"; override fun decrypt(cipherText: String) = cipherText.removePrefix("cipher:").also { require(cipherText.startsWith("cipher:")) } }
