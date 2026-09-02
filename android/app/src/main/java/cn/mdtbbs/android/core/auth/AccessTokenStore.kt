package cn.mdtbbs.android.core.auth

/** Access tokens intentionally live only for the lifetime of this process. */
interface AccessTokenStore {
    fun current(): String?
    fun update(token: String?)
}

class InMemoryAccessTokenStore : AccessTokenStore {
    @Volatile private var token: String? = null
    override fun current(): String? = token
    override fun update(token: String?) { this.token = token }
}
