package cn.mdtbbs.android.core.auth

import cn.mdtbbs.android.core.auth.model.AuthenticatedSession

sealed interface AuthState {
    data object Restoring : AuthState
    data object Anonymous : AuthState
    data class Authenticating(val destination: String?) : AuthState
    data class Authenticated(val session: AuthenticatedSession) : AuthState
    data class AuthenticationFailed(val reason: AuthFailure) : AuthState
}

sealed interface AuthFailure {
    data class Configuration(val message: String) : AuthFailure
    data object InvalidCallback : AuthFailure
    data object StateMismatch : AuthFailure
    data class Remote(val message: String) : AuthFailure
    data object Network : AuthFailure
    data class Native(val code: String) : AuthFailure
}
