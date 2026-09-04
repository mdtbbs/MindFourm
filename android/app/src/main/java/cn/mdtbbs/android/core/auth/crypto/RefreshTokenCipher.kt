package cn.mdtbbs.android.core.auth.crypto

interface RefreshTokenCipher {
    fun encrypt(plainText: String): String
    fun decrypt(cipherText: String): String
}
