package cn.mdtbbs.android.core.auth.di

import android.content.Context
import android.util.Log
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import cn.mdtbbs.android.BuildConfig
import cn.mdtbbs.android.core.auth.*
import cn.mdtbbs.android.core.auth.crypto.AndroidKeystoreRefreshTokenCipher
import cn.mdtbbs.android.core.auth.crypto.RefreshTokenCipher
import cn.mdtbbs.android.core.datastore.DataStoreAuthPendingStore
import cn.mdtbbs.android.core.datastore.DataStoreSecureValueStore
import cn.mdtbbs.android.core.datastore.SecureValueStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Call
import okhttp3.EventListener
import okhttp3.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import okhttp3.MediaType.Companion.toMediaType
import javax.inject.Singleton
import java.io.IOException

@Module
@InstallIn(SingletonComponent::class)
object AuthModule {
    @Provides @Singleton fun authDataStore(@ApplicationContext context: Context) = PreferenceDataStoreFactory.create { context.preferencesDataStoreFile("mobile_auth.preferences_pb") }
    @Provides @Singleton fun accessTokenStore(): AccessTokenStore = InMemoryAccessTokenStore()
    @Provides @Singleton fun refreshTokenCipher(): RefreshTokenCipher = AndroidKeystoreRefreshTokenCipher()
    @Provides @Singleton fun secureValueStore(dataStore: androidx.datastore.core.DataStore<androidx.datastore.preferences.core.Preferences>): SecureValueStore = DataStoreSecureValueStore(dataStore)
    @Provides @Singleton fun refreshTokenStore(values: SecureValueStore, cipher: RefreshTokenCipher): RefreshTokenStore = EncryptedRefreshTokenStore(values, cipher)
    @Provides @Singleton fun pendingStore(dataStore: androidx.datastore.core.DataStore<androidx.datastore.preferences.core.Preferences>, json: Json): AuthPendingStore = DataStoreAuthPendingStore(dataStore, json)
    @Provides @Singleton fun authApi(json: Json): MobileAuthApi = Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL)
        // This intentionally bare client prevents refresh from entering the normal authenticator chain.
        .client(OkHttpClient.Builder().addInterceptor { chain -> chain.proceed(chain.request().newBuilder().header("X-Client-Platform", "android").header("X-Client-Version", BuildConfig.VERSION_CODE.toString()).build()) }.build())
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build().create(MobileAuthApi::class.java)
    @Provides @Singleton fun nativeAuthApi(json: Json): NativeAuthApi = Retrofit.Builder().baseUrl(BuildConfig.NATIVE_AUTH_BASE_URL)
        .client(OkHttpClient.Builder()
            .addInterceptor { chain -> chain.proceed(chain.request().newBuilder().header("X-Client-Platform", "android").header("X-Client-Version", BuildConfig.VERSION_CODE.toString()).build()) }
            .eventListenerFactory { nativeAuthDebugEvents() }
            .build())
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build().create(NativeAuthApi::class.java)
    @Provides @Singleton fun gateway(api: MobileAuthApi, access: AccessTokenStore): MobileAuthGateway = RetrofitMobileAuthGateway(api, access)
    @Provides @Singleton fun nativeGateway(api: NativeAuthApi, access: AccessTokenStore): NativeAuthGateway = RetrofitNativeAuthGateway(api, access)
    @Provides @Singleton fun authRepository(gateway: MobileAuthGateway, nativeGateway: NativeAuthGateway, access: AccessTokenStore, refresh: RefreshTokenStore, pending: AuthPendingStore): AuthRepository = AuthRepository(
        MobileAuthConfiguration(BuildConfig.OAUTH_AUTHORIZATION_ENDPOINT, BuildConfig.OAUTH_CLIENT_ID, BuildConfig.OAUTH_REDIRECT_URI, android.os.Build.MODEL.take(128)), gateway, access, refresh, pending, PkceGenerator(), nativeGateway, BuildConfig.NATIVE_AUTH_CLIENT_ID,
    )
    @Provides @Singleton fun authCoordinator(repository: AuthRepository): AuthCoordinator = AuthCoordinator(repository, BuildConfig.OAUTH_REDIRECT_URI)

    /** Debug-only transport evidence; deliberately excludes URLs, headers, and bodies. */
    private fun nativeAuthDebugEvents() = object : EventListener() {
        override fun responseHeadersEnd(call: Call, response: Response) {
            if (BuildConfig.DEBUG) Log.d("NativeAuth", "response_status=${response.code}")
        }

        override fun callFailed(call: Call, ioe: IOException) {
            if (BuildConfig.DEBUG) Log.w("NativeAuth", "transport_failure=${ioe::class.simpleName}")
        }
    }
}
