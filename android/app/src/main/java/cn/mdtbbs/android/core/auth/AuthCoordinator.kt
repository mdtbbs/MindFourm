package cn.mdtbbs.android.core.auth

import android.content.Intent
import android.net.Uri
import cn.mdtbbs.android.core.auth.model.AuthCallback

/** Keeps Activity intent parsing out of the repository and rejects callbacks for another redirect URI. */
class AuthCoordinator(private val repository: AuthRepository, private val redirectUri: String) {
    suspend fun handleIntent(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_VIEW) return null
        val uri = intent.data ?: return null
        if (!sameRedirect(uri, Uri.parse(redirectUri))) return null
        return repository.handleCallback(AuthCallback(
            code = uri.getQueryParameter("code").orEmpty(),
            state = uri.getQueryParameter("state").orEmpty(),
            error = uri.getQueryParameter("error"),
        ))
    }
    private fun sameRedirect(actual: Uri, expected: Uri) = actual.scheme == expected.scheme && actual.host == expected.host && actual.port == expected.port && actual.path == expected.path
}
