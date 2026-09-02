package cn.mdtbbs.android.core.network.di

import cn.mdtbbs.android.BuildConfig
import cn.mdtbbs.android.core.network.MdtBbsApi
import cn.mdtbbs.android.core.network.auth.AccessTokenInterceptor
import cn.mdtbbs.android.core.network.auth.AccessTokenRefresher
import cn.mdtbbs.android.core.network.auth.AuthRepositoryAccessTokenRefresher
import cn.mdtbbs.android.core.network.auth.TokenRefreshAuthenticator
import cn.mdtbbs.android.core.auth.AccessTokenStore
import cn.mdtbbs.android.core.auth.AuthRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import okhttp3.MediaType.Companion.toMediaType
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton fun json(): Json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    @Provides @Singleton fun accessTokenRefresher(
        repository: AuthRepository,
        accessTokens: AccessTokenStore,
    ): AccessTokenRefresher = AuthRepositoryAccessTokenRefresher(repository, accessTokens)
    @Provides @Singleton fun okHttp(
        accessTokenInterceptor: AccessTokenInterceptor,
        tokenRefreshAuthenticator: TokenRefreshAuthenticator,
    ): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor { chain -> chain.proceed(chain.request().newBuilder().header("X-Client-Platform", "android").header("X-Client-Version", BuildConfig.VERSION_CODE.toString()).build()) }
        .addInterceptor(accessTokenInterceptor)
        .authenticator(tokenRefreshAuthenticator)
        .apply {
            if (BuildConfig.DEBUG) {
                addInterceptor(HttpLoggingInterceptor().apply {
                    // Keep this even at BASIC so future log-level changes cannot leak credentials.
                    redactHeader("Authorization")
                    level = HttpLoggingInterceptor.Level.BASIC
                })
            }
        }
        .build()
    @Provides @Singleton fun retrofit(client: OkHttpClient, json: Json): Retrofit = Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL).client(client).addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build()
    @Provides @Singleton fun api(retrofit: Retrofit): MdtBbsApi = retrofit.create(MdtBbsApi::class.java)
}
