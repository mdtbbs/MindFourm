package cn.mdtbbs.android.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.hilt.navigation.compose.hiltViewModel
import cn.mdtbbs.android.core.auth.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import javax.inject.Inject

sealed interface AuthUiState {
    data object Idle : AuthUiState
    data object CreatingTransaction : AuthUiState
    data class Ready(val methods: Set<String>) : AuthUiState
    data object Submitting : AuthUiState
    data object Authorized : AuthUiState
    data class Error(val code: String) : AuthUiState
}

@HiltViewModel
class LoginViewModel @Inject constructor(private val auth: AuthRepository) : ViewModel() {
    private val mutableUi = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val ui = mutableUi.asStateFlow()
    private var destination: String? = null
    fun begin(postLoginDestination: String?) = viewModelScope.launch {
        destination = postLoginDestination; mutableUi.value = AuthUiState.CreatingTransaction
        runCatching { auth.createTransaction(postLoginDestination) }.fold(
            { mutableUi.value = AuthUiState.Ready(it.availableMethods) },
            { mutableUi.value = AuthUiState.Error(it.code()) },
        )
    }
    fun password(login: String, password: String, complete: (String?) -> Unit) = viewModelScope.launch {
        mutableUi.value = AuthUiState.Submitting
        val result = auth.loginWithPassword(login, password)
        finish(result, complete)
    }
    fun sendSms(phone: String, callback: (SmsChallenge?) -> Unit) = viewModelScope.launch {
        runCatching { auth.sendSms(phone) }.fold({ callback(it) }, { mutableUi.value = AuthUiState.Error(it.code()); callback(null) })
    }
    fun sms(challenge: SmsChallenge, phone: String, code: String, complete: (String?) -> Unit) = viewModelScope.launch {
        mutableUi.value = AuthUiState.Submitting; finish(auth.loginWithSms(challenge.challengeId, phone, code), complete)
    }
    fun qq(provider: SocialAuthProvider, complete: (String?) -> Unit) = viewModelScope.launch {
        mutableUi.value = AuthUiState.Submitting; finish(auth.loginWithQq(provider), complete)
    }
    private fun finish(result: String?, complete: (String?) -> Unit) {
        if (auth.state.value is AuthState.Authenticated) { mutableUi.value = AuthUiState.Authorized; complete(result ?: destination) }
        else mutableUi.value = AuthUiState.Error((auth.state.value as? AuthState.AuthenticationFailed)?.reason?.code() ?: "AUTHORIZATION_FAILED")
    }
}

@Composable fun LoginRoute(destination: String?, onComplete: (String?) -> Unit, onRegister: () -> Unit, onBack: () -> Unit, viewModel: LoginViewModel = hiltViewModel()) {
    val ui by viewModel.ui.collectAsState()
    LaunchedEffect(Unit) { viewModel.begin(destination) }
    LoginScreen(ui, viewModel::password, viewModel::sendSms, viewModel::sms, { viewModel.qq(UnsupportedQqAuthProvider(), onComplete) }, onComplete, onRegister, onBack)
}

@Composable fun LoginScreen(ui: AuthUiState, onPassword: (String, String, (String?) -> Unit) -> Unit, onSendSms: (String, (SmsChallenge?) -> Unit) -> Unit, onSms: (SmsChallenge, String, String, (String?) -> Unit) -> Unit, onQq: () -> Unit, onComplete: (String?) -> Unit, onRegister: () -> Unit, onBack: () -> Unit) {
    var smsMode by rememberSaveable { mutableStateOf(false) }; var login by rememberSaveable { mutableStateOf("") }; var password by rememberSaveable { mutableStateOf("") }; var showPassword by rememberSaveable { mutableStateOf(false) }
    var phone by rememberSaveable { mutableStateOf("") }; var code by rememberSaveable { mutableStateOf("") }; var challenge by remember { mutableStateOf<SmsChallenge?>(null) }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(challenge?.retryAtEpochMs) { while (challenge != null && now < (challenge?.retryAtEpochMs ?: 0L)) { delay(1_000); now = System.currentTimeMillis() } }
    val loading = ui is AuthUiState.CreatingTransaction || ui is AuthUiState.Submitting
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Spacer(Modifier.height(28.dp)); Text("MDTBBS", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.primary); Text("登录你的 MindAuth", style = MaterialTheme.typography.titleMedium)
        if (ui is AuthUiState.Error) Text(authErrorMessage(ui.code), color = MaterialTheme.colorScheme.error)
        if (!smsMode) {
            OutlinedTextField(login, { login = it }, Modifier.fillMaxWidth(), label = { Text("账号 / 手机号 / 邮箱") }, singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next))
            OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("密码") }, singleLine = true, visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(), trailingIcon = { TextButton({ showPassword = !showPassword }) { Text(if (showPassword) "隐藏" else "显示") } }, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done))
            Button({ val value = password; password = ""; onPassword(login, value, onComplete) }, Modifier.fillMaxWidth(), enabled = !loading && login.isNotBlank() && password.isNotBlank()) { if (loading) CircularProgressIndicator(Modifier.size(20.dp)); else Text("登录") }
            TextButton({ smsMode = true }) { Text("使用验证码登录") }
        } else {
            OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text("手机号") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedTextField(code, { code = it }, Modifier.weight(1f), label = { Text("验证码") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)); Button({ onSendSms(phone) { challenge = it; now = System.currentTimeMillis() } }, enabled = !loading && phone.isNotBlank() && (challenge == null || now >= challenge!!.retryAtEpochMs)) { Text(challenge?.let { "${((it.retryAtEpochMs - now).coerceAtLeast(0) + 999) / 1000}s" } ?: "获取验证码") } }
            Button({ challenge?.let { onSms(it, phone, code, onComplete) } }, Modifier.fillMaxWidth(), enabled = !loading && challenge != null && code.isNotBlank()) { Text("登录") }; TextButton({ smsMode = false }) { Text("使用密码登录") }
        }
        HorizontalDivider(); OutlinedButton(onQq, Modifier.fillMaxWidth(), enabled = false) { Text("QQ 登录暂未接入") }
        Row { Text("没有账号？"); TextButton(onRegister) { Text("注册") }; TextButton(onBack) { Text("返回") } }
    }
}

private fun Throwable.code() = (this as? NativeAuthException)?.code ?: "NETWORK_ERROR"
private fun AuthFailure.code() = (this as? AuthFailure.Native)?.code ?: "AUTHORIZATION_FAILED"
private fun authErrorMessage(code: String) = when (code) { "INVALID_CREDENTIALS" -> "账号或密码错误"; "ACCOUNT_DISABLED" -> "该账号已被禁用"; "SMS_CODE_INVALID" -> "验证码错误"; "SMS_CODE_EXPIRED", "AUTH_TRANSACTION_EXPIRED" -> "验证码或登录已过期，请重试"; "SMS_RATE_LIMITED" -> "发送过于频繁，请稍后再试"; "METHOD_DISABLED" -> "此登录方式暂不可用"; "QQ_AUTH_UNAVAILABLE" -> "QQ 登录正在接入中"; else -> "登录失败，请检查网络后重试" }
