package cn.mdtbbs.android.core.auth

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

data class PkcePair(val verifier: String, val challenge: String)

/** RFC 7636 S256 PKCE values. The unreserved alphabet avoids URL encoding ambiguity. */
class PkceGenerator(private val random: SecureRandom = SecureRandom()) {
    fun generate(): PkcePair {
        val bytes = ByteArray(64).also(random::nextBytes)
        val verifier = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        val challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(
            MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)),
        )
        return PkcePair(verifier, challenge)
    }

    fun randomUrlSafeValue(bytes: Int = 32): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(bytes).also(random::nextBytes))
}
