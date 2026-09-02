package cn.mdtbbs.android.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.hilt.navigation.compose.hiltViewModel
import cn.mdtbbs.android.core.auth.AuthRepository
import cn.mdtbbs.android.core.auth.SmsChallenge
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel class RegisterViewModel @Inject constructor(private val auth: AuthRepository) : ViewModel() {
    var message by mutableStateOf<String?>(null); var loading by mutableStateOf(false); var challenge by mutableStateOf<SmsChallenge?>(null)
    fun begin() = viewModelScope.launch { loading = true; runCatching { auth.beginRegistration() }.onFailure { message = "暂时无法开始注册，请检查网络后重试" }; loading = false }
    fun send(phone: String) = viewModelScope.launch { loading = true; runCatching { auth.sendRegistrationSms(phone) }.onSuccess { challenge = it; message = "验证码已发送" }.onFailure { message = "验证码发送失败" }; loading = false }
    fun register(phone: String, code: String, username: String, password: String, email: String, complete: () -> Unit) = viewModelScope.launch { val item = challenge ?: return@launch; loading = true; auth.register(phone, item.challengeId, code, username, password, email); loading = false; if (auth.state.value is cn.mdtbbs.android.core.auth.AuthState.Authenticated) complete() else message = "注册失败，请检查填写内容" }
}

@Composable fun RegisterRoute(onComplete: () -> Unit, onBack: () -> Unit, viewModel: RegisterViewModel = hiltViewModel()) {
    var phone by rememberSaveable { mutableStateOf("") }; var code by rememberSaveable { mutableStateOf("") }; var username by rememberSaveable { mutableStateOf("") }; var email by rememberSaveable { mutableStateOf("") }; var password by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) { viewModel.begin() }
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("创建 MindAuth 账号", style = MaterialTheme.typography.headlineSmall); viewModel.message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text("手机号") }, singleLine = true)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedTextField(code, { code = it }, Modifier.weight(1f), label = { Text("验证码") }, singleLine = true); Button({ viewModel.send(phone) }, enabled = !viewModel.loading && phone.isNotBlank()) { Text("获取验证码") } }
        OutlinedTextField(username, { username = it }, Modifier.fillMaxWidth(), label = { Text("用户名（3-24 个字符）") }, singleLine = true)
        OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("邮箱") }, singleLine = true)
        OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("密码（至少 8 位）") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
        LinearProgressIndicator(progress = { password.length.coerceAtMost(12) / 12f }, modifier = Modifier.fillMaxWidth())
        Button({ val secret = password; password = ""; viewModel.register(phone, code, username, secret, email, onComplete) }, Modifier.fillMaxWidth(), enabled = !viewModel.loading && viewModel.challenge != null && code.isNotBlank() && username.length >= 3 && password.length >= 8 && email.isNotBlank()) { Text("注册并登录") }
        TextButton(onBack) { Text("已有账号？返回登录") }
    }
}
