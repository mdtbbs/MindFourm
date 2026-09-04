package cn.mdtbbs.android.core.auth.crypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** AES-GCM key material never leaves Android Keystore. Encoded payload is version || IV || ciphertext. */
class AndroidKeystoreRefreshTokenCipher(private val alias: String = KEY_ALIAS) : RefreshTokenCipher {
    override fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(ByteBuffer.allocate(1 + cipher.iv.size + encrypted.size)
            .put(FORMAT_VERSION).put(cipher.iv).put(encrypted).array(), Base64.NO_WRAP)
    }

    override fun decrypt(cipherText: String): String {
        val bytes = Base64.decode(cipherText, Base64.NO_WRAP)
        require(bytes.size > 1 + IV_BYTES && bytes[0] == FORMAT_VERSION) { "Unsupported encrypted refresh-token payload" }
        val iv = bytes.copyOfRange(1, 1 + IV_BYTES)
        val payload = bytes.copyOfRange(1 + IV_BYTES, bytes.size)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv)) }
        return cipher.doFinal(payload).toString(Charsets.UTF_8)
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE).apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build())
        }.generateKey()
    }

    private companion object {
        const val KEY_ALIAS = "mdtbbs.mobile.refresh-token.v1"; const val ANDROID_KEY_STORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"; const val IV_BYTES = 12; const val TAG_BITS = 128; const val FORMAT_VERSION: Byte = 1
    }
}
