package cn.mdtbbs.android.core.datastore

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import cn.mdtbbs.android.core.auth.AuthPendingState
import cn.mdtbbs.android.core.auth.AuthPendingStore
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

interface SecureValueStore {
    suspend fun read(): String?
    suspend fun write(value: String)
    suspend fun clear()
}

class DataStoreSecureValueStore(private val dataStore: DataStore<Preferences>) : SecureValueStore {
    private val valueKey = stringPreferencesKey("encrypted_refresh_token")
    override suspend fun read(): String? = dataStore.data.first()[valueKey]
    override suspend fun write(value: String) { dataStore.edit { it[valueKey] = value } }
    override suspend fun clear() { dataStore.edit { it.remove(valueKey) } }
}

class DataStoreAuthPendingStore(private val dataStore: DataStore<Preferences>, private val json: Json) : AuthPendingStore {
    private val pendingKey = stringPreferencesKey("pending_mobile_auth")
    override suspend fun read(): AuthPendingState? = dataStore.data.first()[pendingKey]?.let { encoded ->
        runCatching { json.decodeFromString(PendingDto.serializer(), encoded).toDomain() }.getOrNull()
    }
    override suspend fun save(pending: AuthPendingState) {
        dataStore.edit { it[pendingKey] = json.encodeToString(PendingDto.serializer(), PendingDto.from(pending)) }
    }
    override suspend fun clear() { dataStore.edit { it.remove(pendingKey) } }
}

@Serializable private data class PendingDto(
    val codeVerifier: String, val state: String, val nonce: String, val redirectUri: String,
    val postLoginDestination: String?, val createdAtEpochMs: Long,
) {
    fun toDomain() = AuthPendingState(codeVerifier, state, nonce, redirectUri, postLoginDestination, createdAtEpochMs)
    companion object { fun from(value: AuthPendingState) = PendingDto(value.codeVerifier, value.state, value.nonce, value.redirectUri, value.postLoginDestination, value.createdAtEpochMs) }
}
