plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose"); id("org.jetbrains.kotlin.plugin.serialization"); id("com.google.dagger.hilt.android"); kotlin("kapt") }
android { namespace = "cn.mdtbbs.android"; compileSdk = 35
  defaultConfig {
    applicationId = "cn.mdtbbs.android"; minSdk = 26; targetSdk = 35; versionCode = 100; versionName = "0.1.0"
    buildConfigField("String", "API_BASE_URL", "\"${providers.gradleProperty("mdtbbsApiBaseUrl").orNull ?: "https://mdtbbs.cn/"}\"")
    // Deliberately empty until MindAuth registers and deploys the verified HTTPS App Link.
    buildConfigField("String", "OAUTH_REDIRECT_URI", "\"${providers.gradleProperty("mdtbbsOauthRedirectUri").orNull.orEmpty()}\"")
    buildConfigField("String", "OAUTH_AUTHORIZATION_ENDPOINT", "\"${providers.gradleProperty("mdtbbsOauthAuthorizationEndpoint").orNull.orEmpty()}\"")
    buildConfigField("String", "OAUTH_CLIENT_ID", "\"${providers.gradleProperty("mdtbbsOauthClientId").orNull.orEmpty()}\"")
    buildConfigField("String", "NATIVE_AUTH_BASE_URL", "\"${providers.gradleProperty("mdtbbsNativeAuthBaseUrl").orNull ?: "https://auth.mdtbbs.cn/"}\"")
    buildConfigField("String", "NATIVE_AUTH_CLIENT_ID", "\"${providers.gradleProperty("mdtbbsNativeAuthClientId").orNull ?: "mdtbbs_android"}\"")
  }
  buildFeatures { compose = true; buildConfig = true }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
}
dependencies {
  implementation(platform("androidx.compose:compose-bom:2024.09.03")); implementation("androidx.core:core-ktx:1.15.0"); implementation("androidx.activity:activity-compose:1.10.0")
  implementation("androidx.compose.material3:material3"); implementation("androidx.compose.material:material-icons-extended"); implementation("androidx.compose.ui:ui-tooling-preview"); debugImplementation("androidx.compose.ui:ui-tooling")
  implementation("androidx.navigation:navigation-compose:2.8.5"); implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7"); implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
  implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
  implementation("com.squareup.retrofit2:retrofit:2.11.0"); implementation("com.squareup.retrofit2:converter-kotlinx-serialization:2.11.0"); implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3"); implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
  implementation("androidx.datastore:datastore-preferences:1.1.1")
  implementation("androidx.room:room-runtime:2.6.1"); implementation("androidx.room:room-ktx:2.6.1"); implementation("androidx.room:room-paging:2.6.1"); kapt("androidx.room:room-compiler:2.6.1"); implementation("androidx.paging:paging-runtime:3.3.4"); implementation("androidx.paging:paging-compose:3.3.4")
  implementation("io.coil-kt:coil-compose:2.7.0"); implementation("com.google.dagger:hilt-android:2.52"); kapt("com.google.dagger:hilt-compiler:2.52")
  testImplementation("junit:junit:4.13.2")
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
  testImplementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
}
